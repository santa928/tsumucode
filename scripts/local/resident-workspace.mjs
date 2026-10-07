import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { RequestError, LIMITS } from './protocol.mjs';
import {
  PROJECT_LIMITS,
  PROJECT_PROFILE,
  exact,
  expectedRevision,
  runId,
} from './project-protocol.mjs';
import { docker, followOutput, cleanupOwned, removeContainer } from './docker-engine.mjs';
import { projectImage, projectConfig, probeProject } from './project-engine.mjs';

/** 常駐runの排他・期限・回収を扱う。Sourceの更新とHTTP認証は各担当へ委譲する。 */
export class ResidentWorkspace {
  #store;
  #owner;
  #image;
  #slot;
  #lastRuns = new Map();
  #current;
  #engine;
  #limits;

  constructor({ store, owner, image, slot, engine, limits = PROJECT_LIMITS }) {
    this.#store = store;
    this.#owner = owner;
    this.#image = image;
    this.#slot = slot;
    this.#limits = limits;
    this.#engine = engine ?? {
      docker,
      followOutput,
      cleanupOwned,
      removeContainer,
      projectImage,
      projectConfig,
      probeProject,
    };
  }

  async status(id) {
    const record = await this.#store.read(id);
    const current = this.#current?.workspaceId === id ? this.#current.record : undefined;
    return { ...record, lastRun: current ?? this.#lastRuns.get(id) ?? record.lastRun };
  }

  async save(id, input) {
    exact(input, ['expectedSourceRevision', 'files']);
    const record = await this.#store.save(id, input.expectedSourceRevision, input.files);
    if (this.#current?.workspaceId === id) this.#current.activityAt = Date.now();
    const current = this.#current?.workspaceId === id ? this.#current.record : undefined;
    return { ...record, lastRun: current ?? this.#lastRuns.get(id) ?? record.lastRun };
  }

  async reset(id, input) {
    exact(input, ['expectedSourceRevision', 'confirmReset']);
    if (input.confirmReset !== true) throw new RequestError(400, 'Resetの明示確認が必要です。');
    const status = await this.status(id);
    if (this.#current?.workspaceId === id || status.lastRun?.cleanupPending)
      throw new RequestError(409, '停止してからResetしてください。');
    return this.#store.reset(id, input.expectedSourceRevision);
  }

  async start(id, input, signal) {
    exact(input, ['expectedSourceRevision']);
    expectedRevision(input.expectedSourceRevision);
    if (signal?.aborted) throw new RequestError(408, '起動要求の接続が切れました。');
    const run = {
      workspaceId: id,
      activityAt: Date.now(),
      reason: undefined,
      record: {
        workspaceId: id,
        profile: PROJECT_PROFILE,
        // IDはcontrollerが発行する。履歴を打ち切っても旧stopを新runへ一致させない。
        runId: randomUUID(),
        state: 'starting',
        cleanupPending: false,
      },
    };
    // await前に共通枠を確保し、起動中断から回収完了まで他のrunを作らせない。
    this.#slot.acquire(run);
    this.#current = run;
    const prepared = new Promise((resolve, reject) => {
      run.prepared = { resolve, reject };
    });
    const disconnected = () => {
      void this.#cancel(run, 'client-disconnected');
    };
    signal?.addEventListener('abort', disconnected, { once: true });
    run.done = this.#execute(run, input.expectedSourceRevision).finally(() => {
      signal?.removeEventListener('abort', disconnected);
    });
    await prepared;
    if (signal?.aborted) throw new RequestError(408, '起動要求の接続が切れました。');
    return run.record;
  }

  async stop(id, input, reason = 'stopped') {
    exact(input, ['runId']);
    runId(input.runId);
    const run = this.#current;
    if (!run || run.workspaceId !== id || run.record.runId !== input.runId)
      throw new RequestError(409, '対象runは実行中ではありません。状態を再取得してください。');
    await this.#cancel(run, reason);
    await run.done;
    return this.status(id);
  }

  async #cancel(run, reason) {
    run.reason ??= reason;
    run.record.state = 'stopping';
    if (run.containerId) {
      try {
        await this.#engine.docker('POST', `/containers/${run.containerId}/kill`);
      } catch (error) {
        if (error.status !== 404 && error.status !== 409) this.#slot.recoveryNeeded();
      }
    }
  }

  activity(id, input) {
    exact(input, ['runId']);
    runId(input.runId);
    const run = this.#current;
    if (!run || run.workspaceId !== id || run.record.runId !== input.runId)
      throw new RequestError(409, '対象runは実行中ではありません。');
    run.activityAt = Date.now();
    return run.record;
  }

  async shutdown() {
    if (this.#current)
      await this.stop(
        this.#current.workspaceId,
        { runId: this.#current.record.runId },
        'controller-stopped',
      );
  }

  /** 回収と永続記録の修復後に、メモリの障害状態もその確定記録へ合わせる。 */
  async recovered() {
    for (const [id, run] of this.#lastRuns) {
      if (run.cleanupPending || run.reason === 'state-save-failed') {
        const record = await this.#store.read(id);
        this.#lastRuns.set(id, record.lastRun);
      }
    }
  }

  async #execute(run, revision) {
    let output;
    let closing = false;
    let claimed = false;
    let createAttempted = false;
    const records = [];
    try {
      await this.#slot.ready();
      const image = await this.#engine.projectImage(this.#image);
      const source = await this.#store.claimRun(run.workspaceId, revision, run.record);
      run.record = source.lastRun;
      claimed = true;
      run.prepared.resolve();
      // 準備待ちの間に停止した場合は、確認済みSource/run記録だけを確定しcreateしない。
      if (run.reason) return;
      createAttempted = true;
      const container = await this.#engine.docker(
        'POST',
        '/containers/create',
        this.#engine.projectConfig(source, this.#owner, run.record.runId, image),
      );
      run.containerId = container.Id;
      if (!run.reason) {
        await this.#engine.docker('POST', `/containers/${container.Id}/start`);
        run.startedAt = Date.now();
        run.activityAt = run.startedAt;
        output = this.#engine.followOutput(
          container.Id,
          (stream, data) => records.push(data),
          () => {
            run.reason ??= 'output-limit';
          },
          this.#limits.lifetimeMs + this.#limits.startMs + 10000,
        );
        void output.done.catch(() => {
          if (!closing) run.reason ??= 'output-failed';
        });
        while (!run.reason) {
          const inspected = await this.#engine.docker('GET', `/containers/${container.Id}/json`);
          if (run.reason) break;
          if (!inspected.State.Running) {
            run.reason = inspected.State.OOMKilled ? 'memory-limit' : 'server-exited';
            run.record.exitCode = inspected.State.ExitCode;
            break;
          }
          const now = Date.now();
          if (now - run.startedAt >= this.#limits.lifetimeMs) run.reason = 'lifetime';
          else if (now - run.activityAt >= this.#limits.idleMs) run.reason = 'idle';
          else if (run.record.state === 'starting') {
            if (now - run.startedAt >= this.#limits.startMs) run.reason = 'startup-timeout';
            else if ((await this.#engine.probeProject(container.Id)) && !run.reason) {
              if (Date.now() - run.startedAt >= this.#limits.startMs)
                run.reason = 'startup-timeout';
              else {
                run.record.state = 'ready';
                await this.#store.updateRun(run.workspaceId, run.record);
              }
            }
          }
          if (!run.reason) await delay(250);
        }
      }
    } catch (error) {
      run.prepared.reject(error);
      run.reason ??= 'engine-failed';
      if (createAttempted) this.#slot.recoveryNeeded();
    } finally {
      closing = true;
      output?.close();
      try {
        if (run.containerId) await this.#engine.removeContainer(run.containerId);
        // create成功の応答だけ失われた場合もowner labelで実体を回収する。
        else if (createAttempted) await this.#engine.cleanupOwned(this.#owner);
      } catch {
        run.reason = 'cleanup-failed';
        run.record.cleanupPending = true;
        this.#slot.recoveryNeeded();
      }
      const finalRecord = { ...run.record };
      run.record.state = 'stopping';
      finalRecord.state =
        run.reason === 'idle'
          ? 'idle'
          : ['stopped', 'controller-stopped', 'client-disconnected'].includes(run.reason)
            ? 'stopped'
            : 'failed';
      finalRecord.reason = run.reason;
      finalRecord.output = new TextDecoder().decode(
        Buffer.from(Buffer.concat(records).toString('utf8')).subarray(0, LIMITS.outputBytes),
        { stream: true },
      );
      if (claimed) {
        try {
          await this.#store.updateRun(run.workspaceId, finalRecord);
        } catch {
          finalRecord.state = 'failed';
          finalRecord.reason = 'state-save-failed';
          this.#slot.recoveryNeeded();
        }
      }
      run.record = finalRecord;
      if (claimed) this.#lastRuns.set(run.workspaceId, finalRecord);
      this.#current = undefined;
      this.#slot.release(run);
    }
  }
}
