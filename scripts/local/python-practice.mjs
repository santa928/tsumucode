import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'node:timers';
import { containerConfig, docker, followOutput } from './docker-engine.mjs';
import {
  validPythonInputLines,
  validPythonFiles,
  pythonSourceSnapshot,
  PYTHON_LESSONS,
} from './pythonLessonProfiles.mjs';

export const PRACTICE_LIMITS = Object.freeze({
  activeMs: 5000,
  waitingMs: 60000,
  absoluteMs: 65000,
  inputLines: 16,
  inputBytes: 1024,
  resultMs: 30000,
  leaseMs: 3000,
  outputBytes: 64 * 1024,
  controlBytes: 4096,
  frameBytes: 512,
});
const prefix = 'TSUMUCODE_INPUT ';

/** stdinだけを接続する。学習者出力は別のbounded logs streamで読む。 */
async function openStdin(id, onClose) {
  let stream;
  await new Promise((resolve, reject) => {
    const req = request({
      socketPath: '/var/run/docker.sock',
      path: `/v1.47/containers/${id}/attach?stream=1&stdin=1&stdout=0&stderr=0`,
      method: 'POST',
      headers: { Connection: 'Upgrade', Upgrade: 'tcp' },
    });
    const deadline = setTimeout(() => req.destroy(new Error('stdin attach timeout')), 1000);
    req.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    req.on('response', (res) => {
      clearTimeout(deadline);
      res.resume();
      reject(new Error(`stdin attach ${res.statusCode}`));
    });
    req.on('upgrade', (res, socket) => {
      clearTimeout(deadline);
      stream = socket;
      socket.on('error', onClose);
      socket.on('close', onClose);
      socket.resume();
      resolve();
    });
    req.end();
  });
  return {
    write(value) {
      return new Promise((resolve, reject) => {
        const deadline = setTimeout(() => {
          stream.destroy();
          reject(new Error('stdin write timeout'));
        }, 500);
        stream.write(value, (error) => {
          clearTimeout(deadline);
          if (error) reject(error);
          else resolve();
        });
      });
    },
    eof() {
      stream.end();
    },
    close() {
      stream.destroy();
    },
  };
}

/** 次runを旧containerの削除確認前に許可しない、練習専用の排他所有者。 */
export class PracticeRunner {
  constructor(owner, bootstrap, api = docker) {
    this.owner = owner;
    this.bootstrap = bootstrap;
    this.api = api;
    this.active = undefined;
    this.recoveryNeeded = false;
    this.records = new Map();
  }

  async create(input) {
    if (this.active || this.recoveryNeeded) throw new Error('practice busy or recovery-needed');
    while (this.records.size >= 32) this.records.values().next().value.clearRaw();
    const run = new PracticeRun(this, input);
    this.active = run;
    this.records.set(run.identity.runId, run);
    await run.start();
    return run;
  }
}

/** 練習は不信申告を受け、時計・送達・回収だけを信頼側で管理する。 */
export class PracticeRun {
  constructor(runner, input) {
    const profile = PYTHON_LESSONS[input.exerciseId]?.profile;
    const files = { ...input.files };
    const revision = input.executionRevision;
    const source = profile ? pythonSourceSnapshot(files, profile) : undefined;
    if (
      !profile ||
      !validPythonFiles(files, profile) ||
      typeof input.exerciseSessionId !== 'string' ||
      typeof source !== 'string' ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new Error('invalid practice source');
    this.runner = runner;
    this.identity = Object.freeze({
      runId: randomUUID(),
      sessionId: input.exerciseSessionId,
      executionRevision: revision,
      sourceHash: createHash('sha256').update(source).digest('hex'),
    });
    this.files = files;
    this.profile = profile;
    this.practice = true;
    this.phase = 'preparing';
    this.sequence = 0;
    this.inputCount = 0;
    this.inputBytes = 0;
    this.generation = 0;
    this.activeMs = 0;
    this.waitingMs = 0;
    this.controlBytes = 0;
    this.stdout = [];
    this.stderr = [];
    this.partialControl = Buffer.alloc(0);
    this.lastSeen = performance.now();
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  async api(method, path, body, timeout = 1000) {
    return this.runner.api(method, path, body, timeout);
  }

  check(generation) {
    if (this.reason || this.generation !== generation) throw new Error('practice ended');
  }

  account(now = performance.now()) {
    if (this.clockAt === undefined) return;
    const elapsed = Math.max(0, now - this.clockAt);
    if (this.clock === 'active') this.activeMs += elapsed;
    else if (this.clock === 'waiting') this.waitingMs += elapsed;
    this.clockAt = now;
  }

  clockTo(clock) {
    this.account();
    this.clock = clock;
  }

  watch() {
    if (this.reason) return;
    const now = performance.now();
    this.account(now);
    if (now - this.startedAt >= PRACTICE_LIMITS.absoluteMs) void this.stop('absolute-timeout');
    else if (this.activeMs >= PRACTICE_LIMITS.activeMs) void this.stop('active-timeout');
    else if (this.waitingMs >= PRACTICE_LIMITS.waitingMs) void this.stop('waiting-timeout');
    else if (now - this.lastSeen >= PRACTICE_LIMITS.leaseMs) void this.stop('client-disconnected');
  }

  async start() {
    const generation = this.generation;
    try {
      const config = containerConfig(this.files, this.runner.owner, true);
      const payload = Buffer.from(
        JSON.stringify({
          runId: this.identity.runId,
          files: this.files,
        }),
      ).toString('base64');
      config.Cmd = [
        '-I',
        '-S',
        '-B',
        '-u',
        '-c',
        this.runner.bootstrap,
        ...(payload.match(/.{1,16384}/gu) ?? []),
      ];
      Object.assign(config, { OpenStdin: true, StdinOnce: true, AttachStdin: true });
      config.Labels['app.tsumucode.run'] = this.identity.runId;
      this.creation = this.api('POST', '/containers/create', config, 5000).then(
        (created) => {
          if (typeof created?.Id !== 'string' || created.Id.length === 0) {
            this.creationUnknown = true;
            throw new Error('practice creation identity missing');
          }
          this.containerId = created.Id;
          return created;
        },
        (error) => {
          this.creationUnknown = true;
          throw error;
        },
      );
      await this.creation;
      this.check(generation);
      this.stdin = await openStdin(this.containerId, () => {
        void this.transportClosed();
      });
      if (this.reason || this.generation !== generation) {
        this.stdin.close();
        this.stdin = undefined;
        this.check(generation);
      }
      this.phase = 'running';
      this.startedAt = performance.now();
      this.clockAt = this.startedAt;
      this.clock = 'active';
      this.lastSeen = this.startedAt;
      this.watchdog = setInterval(() => this.watch(), 10);
      this.absoluteTimer = setTimeout(() => {
        void this.stop('absolute-timeout');
      }, PRACTICE_LIMITS.absoluteMs);
      await this.api('POST', `/containers/${this.containerId}/start`);
      this.check(generation);
      this.output = followOutput(
        this.containerId,
        (kind, data) => this.record(kind, data),
        () => {
          void this.stop('output-limit');
        },
        PRACTICE_LIMITS.absoluteMs + 5000,
      );
      this.output.done.catch(() => {
        if (!this.reason) void this.stop('transport-error');
      });
      void this.waitForExit(generation);
    } catch {
      await this.stop('system-error');
    }
  }

  record(kind, data) {
    if (this.reason) return;
    if (kind === 1) this.stdout.push(Buffer.from(data));
    else {
      this.partialControl = Buffer.concat([this.partialControl, data]);
      let end;
      while ((end = this.partialControl.indexOf(10)) !== -1) {
        const line = this.partialControl.subarray(0, end);
        this.partialControl = this.partialControl.subarray(end + 1);
        const text = line.toString('utf8');
        if (!text.startsWith(prefix)) this.stderr.push(Buffer.concat([line, Buffer.from('\n')]));
        else {
          this.controlBytes += line.length;
          if (
            line.length > PRACTICE_LIMITS.frameBytes ||
            this.controlBytes > PRACTICE_LIMITS.controlBytes
          ) {
            void this.stop('protocol-limit');
            return;
          }
          try {
            this.requestInput(JSON.parse(text.slice(prefix.length)));
          } catch {
            void this.stop('protocol-error');
            return;
          }
        }
      }
      if (this.partialControl.length > 4096) void this.stop('protocol-limit');
    }
  }

  requestInput(packet) {
    if (this.reason) return;
    if (
      !packet ||
      Object.keys(packet).length !== 3 ||
      packet.type !== 'request-input' ||
      packet.runId !== this.identity.runId ||
      !Number.isSafeInteger(packet.sequence) ||
      packet.sequence !== this.sequence + 1 ||
      packet.sequence > 17 ||
      this.inputClosed
    ) {
      void this.stop('protocol-error');
      return;
    }
    if (this.operation) {
      if (this.pendingRequest) void this.stop('protocol-limit');
      else this.pendingRequest = packet;
      return;
    }
    if (this.phase !== 'running') {
      void this.stop('protocol-error');
      return;
    }
    this.sequence = packet.sequence;
    this.operation = true;
    this.phase = 'pausing';
    const generation = this.generation;
    this.operationDone = (async () => {
      try {
        await this.api('POST', `/containers/${this.containerId}/pause`);
        this.check(generation);
        const inspected = await this.api('GET', `/containers/${this.containerId}/json`);
        this.check(generation);
        if (!inspected.State.Running || !inspected.State.Paused)
          throw new Error('pause not confirmed');
        this.clockTo('waiting');
        this.phase = 'waiting-input';
      } catch {
        if (!this.reason) await this.stop('system-error');
      } finally {
        this.releaseOperation();
      }
    })();
  }

  releaseOperation() {
    this.operation = false;
    const pending = this.pendingRequest;
    this.pendingRequest = undefined;
    if (pending && !this.reason) this.requestInput(pending);
  }

  matches(identity) {
    return (
      identity &&
      Object.keys(identity).length === 4 &&
      Object.keys(this.identity).every((key) => identity[key] === this.identity[key])
    );
  }

  heartbeat(identity) {
    if (!this.matches(identity)) throw new Error('practice identity mismatch');
    if (!this.reason) this.lastSeen = performance.now();
    return this.snapshot();
  }

  async send(identity, sequence, line, eof = false) {
    if (
      !this.matches(identity) ||
      this.reason ||
      this.operation ||
      this.inputClosed ||
      this.phase !== 'waiting-input' ||
      sequence !== this.sequence
    )
      throw new Error('stale practice input');
    if (typeof eof !== 'boolean' || (eof ? line !== undefined : !validPythonInputLines([line])))
      throw new Error('invalid practice input');
    const bytes = eof ? 0 : Buffer.byteLength(line) + (this.inputCount ? 1 : 0);
    if (!eof && (this.inputCount >= 16 || this.inputBytes + bytes > 1024))
      throw new Error('practice input limit');
    this.operation = true;
    this.clockTo('active');
    this.phase = 'resuming';
    const generation = this.generation;
    if (eof) this.inputClosed = true;
    try {
      await this.api('POST', `/containers/${this.containerId}/unpause`);
      this.check(generation);
      const inspected = await this.api('GET', `/containers/${this.containerId}/json`);
      this.check(generation);
      if (inspected.State.Paused) throw new Error('unpause not confirmed');
      this.phase = 'running';
      if (eof) this.stdin.eof();
      else {
        await this.stdin.write(Buffer.from(`${line}\n`));
        this.check(generation);
        this.inputCount += 1;
        this.inputBytes += bytes;
      }
    } catch {
      if (!this.reason) await this.stop('transport-error');
      throw new Error('practice delivery failed');
    } finally {
      this.releaseOperation();
    }
  }

  async transportClosed() {
    if (this.reason || this.inputClosed || !this.containerId) return;
    try {
      const inspected = await this.api('GET', `/containers/${this.containerId}/json`);
      if (!this.reason && inspected.State.Running) await this.stop('transport-error');
    } catch {
      if (!this.reason) await this.stop('transport-error');
    }
  }

  async waitForExit(generation) {
    try {
      const ended = await this.api(
        'POST',
        `/containers/${this.containerId}/wait?condition=not-running`,
        undefined,
        PRACTICE_LIMITS.absoluteMs + 5000,
      );
      this.check(generation);
      await this.output.done;
      this.check(generation);
      const inspected = await this.api('GET', `/containers/${this.containerId}/json`);
      this.check(generation);
      this.exitCode = ended.StatusCode;
      if (inspected.State.OOMKilled) {
        await this.stop('memory-limit');
        return;
      }
      await this.stop(ended.StatusCode === 0 ? 'completed' : 'code-error');
    } catch {
      if (!this.reason) await this.stop('transport-error');
    }
  }

  clearRaw(removeRecord = true) {
    this.stdout.length = 0;
    this.stderr.length = 0;
    this.partialControl = Buffer.alloc(0);
    this.pendingRequest = undefined;
    this.files = undefined;
    this.purged = true;
    if (removeRecord) this.runner.records.delete(this.identity.runId);
  }

  ack(identity) {
    if (!this.matches(identity) || !this.reason) throw new Error('invalid practice ack');
    this.clearRaw(false);
  }

  /** 削除失敗時も所有containerだけを停止する。停止確認と回収確認は分ける。 */
  async haltUnremoved(id) {
    try {
      const inspected = await this.api('GET', `/containers/${id}/json`);
      if (inspected.State.Running) {
        if (inspected.State.Paused) await this.api('POST', `/containers/${id}/unpause`);
        await this.api('POST', `/containers/${id}/kill`, undefined, 1500);
      }
      const stopped = await this.api('GET', `/containers/${id}/json`);
      this.stoppedConfirmed = !stopped.State.Running;
    } catch (error) {
      this.stoppedConfirmed = error.status === 404;
    }
    // 実行停止を確認できても削除できたとは扱わず、次runを拒否し続ける。
  }

  async stop(reason) {
    if (this.reason) return this.done;
    this.reason = reason;
    this.endedAt = performance.now();
    this.account(this.endedAt);
    this.clock = undefined;
    this.generation += 1;
    this.phase = 'ended';
    clearInterval(this.watchdog);
    clearTimeout(this.absoluteTimer);
    this.rawTimer = setTimeout(() => this.clearRaw(), PRACTICE_LIMITS.resultMs);
    this.rawTimer.unref();
    if (!['completed', 'code-error'].includes(reason)) this.clearRaw(false);
    this.stdin?.close();
    this.output?.close();
    this.stdin = undefined;
    this.output = undefined;
    try {
      await this.creation;
    } catch {
      /* 応答を失ったcreateも所有ラベルで回収する。 */
    }
    if (!this.containerId) {
      try {
        const filters = encodeURIComponent(
          JSON.stringify({
            label: [
              `app.tsumucode.owner=${this.runner.owner}`,
              `app.tsumucode.run=${this.identity.runId}`,
            ],
          }),
        );
        const found = await this.api('GET', `/containers/json?all=1&filters=${filters}`);
        for (const item of found) {
          try {
            await this.api('DELETE', `/containers/${item.Id}?force=1&v=1`, undefined, 1500);
          } catch (error) {
            await this.haltUnremoved(item.Id);
            throw error;
          }
        }
        const remaining = await this.api('GET', `/containers/json?all=1&filters=${filters}`);
        if (remaining.length) throw new Error('creation cleanup unconfirmed');
        if (this.creationUnknown) this.runner.recoveryNeeded = true;
        else this.removed = true;
      } catch {
        this.runner.recoveryNeeded = true;
        this.clearRaw(false);
      }
    }
    if (this.containerId) {
      try {
        await this.api('DELETE', `/containers/${this.containerId}?force=1&v=1`, undefined, 1500);
        let gone = false;
        try {
          await this.api('GET', `/containers/${this.containerId}/json`);
        } catch (error) {
          gone = error.status === 404;
        }
        if (!gone) throw new Error('practice removal unconfirmed');
        this.containerId = undefined;
        this.removed = true;
      } catch {
        this.runner.recoveryNeeded = true;
        this.clearRaw(false);
        await this.haltUnremoved(this.containerId);
      }
    }
    if (this.runner.active === this && !this.runner.recoveryNeeded) this.runner.active = undefined;
    // 完了Promiseにraw文字列を保持させず、ack/TTL後に再取得できないようにする。
    this.resolveDone();
    return this.done;
  }

  snapshot() {
    this.account();
    return {
      purpose: 'practice',
      identity: this.identity,
      phase: this.phase,
      reason: this.reason ?? null,
      inputRequestSequence: this.phase === 'waiting-input' ? this.sequence : null,
      inputCount: this.inputCount,
      inputBytes: this.inputBytes,
      activeMs: Math.round(this.activeMs),
      waitingMs: Math.round(this.waitingMs),
      elapsedMs: Math.round(
        (this.endedAt ?? performance.now()) - (this.startedAt ?? performance.now()),
      ),
      stdout: Buffer.concat(this.stdout).toString('utf8'),
      stderr: Buffer.concat(this.stderr).toString('utf8') + this.partialControl.toString('utf8'),
      removed: Boolean(this.removed),
      recoveryNeeded: this.runner.recoveryNeeded,
      purged: Boolean(this.purged),
      exitCode: this.exitCode ?? null,
    };
  }
}
