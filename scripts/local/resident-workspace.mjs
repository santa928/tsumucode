import { isNextForm } from './next-form-preview.mjs';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { RequestError, LIMITS } from './protocol.mjs';
import { PROJECT_LIMITS, exact, expectedRevision, runId } from './project-protocol.mjs';
import { docker, followOutput, cleanupOwned, removeContainer } from './docker-engine.mjs';
import { projectImage, projectConfig, probeProject, applyProject } from './project-engine.mjs';
import { previewBase, previewOrigin } from './preview-contract.mjs';
import { NEXT_PROFILE, workspaceProfile } from './next-project-protocol.mjs';
import { gradeProject } from './project-grade-engine.mjs';

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
  #transport;
  #graderImage;
  #nextImage;

  constructor({
    store,
    owner,
    image,
    graderImage,
    nextImage,
    slot,
    engine,
    transport,
    limits = PROJECT_LIMITS,
  }) {
    this.#store = store;
    this.#owner = owner;
    this.#image = image;
    this.#slot = slot;
    this.#limits = limits;
    this.#transport = transport;
    this.#graderImage = graderImage;
    this.#nextImage = nextImage;
    this.#engine = engine ?? {
      docker,
      followOutput,
      cleanupOwned,
      removeContainer,
      projectImage,
      projectConfig,
      probeProject,
      applyProject,
      gradeProject,
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
        profile: workspaceProfile(id),
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

  /** 現在runだけの固定socket identityを返す。Sourceや管理資格情報を含めない。 */
  previewTarget() {
    const run = this.#current;
    if (!run?.socket || run.reason || !['ready', 'applying'].includes(run.record.state))
      return undefined;
    const streaming = run.workspaceId === 'next-ch03-l02-e01';
    const form = isNextForm(run.workspaceId);
    if ((streaming || form) && run.record.state !== 'ready') return undefined;
    return {
      workspaceId: run.workspaceId,
      runId: run.record.runId,
      profile: run.record.profile,
      ...run.socket,
      ...(streaming || form ? { sourceRevision: run.record.sourceRevision } : {}),
      ...(form ? { grading: run.grading === true } : {}),
    };
  }

  /** 保存版と反映版を区別し、停止・同時反映・古い要求を現在runへ混ぜない。 */
  async apply(id, input) {
    exact(input, ['runId', 'expectedSourceRevision', 'expectedSourceHash']);
    runId(input.runId);
    expectedRevision(input.expectedSourceRevision);
    if (!/^[a-f0-9]{64}$/u.test(input.expectedSourceHash))
      throw new RequestError(400, 'Source hashが不正です。');
    const run = this.#current;
    if (
      !this.#transport ||
      !run ||
      run.workspaceId !== id ||
      run.record.runId !== input.runId ||
      run.record.state !== 'ready' ||
      run.grading ||
      run.reason
    )
      throw new RequestError(409, '対象runは反映できる状態ではありません。');
    run.record.state = 'applying';
    let finish;
    run.applyDone = new Promise((resolve) => {
      finish = resolve;
    });
    try {
      const source = await this.#store.read(id);
      if (
        source.sourceRevision !== input.expectedSourceRevision ||
        source.sourceHash !== input.expectedSourceHash
      )
        throw new RequestError(409, 'Source版が更新されています。再取得してください。');
      if (run.reason) throw new RequestError(409, '対象runを停止しています。');
      await this.#store.updateRun(id, run.record);
      if (run.reason) throw new RequestError(409, '対象runを停止しています。');
      await this.#engine.applyProject(run.containerId, source, run.record.runId, {
        socket: run.socket,
        applied: { ...run.record },
      });
      if (run.reason) throw new RequestError(409, '対象runを停止しています。');
      run.record.sourceRevision = source.sourceRevision;
      run.record.sourceHash = source.sourceHash;
      run.record.state = 'ready';
      run.activityAt = Date.now();
      await this.#store.updateRun(id, run.record);
      return this.status(id);
    } catch (error) {
      if (!(error instanceof RequestError)) await this.#cancel(run, 'apply-failed');
      else if (!run.reason) run.record.state = 'ready';
      throw error;
    } finally {
      finish();
      run.applyDone = undefined;
    }
  }

  /** trusted Browserで同じrunの可視DOMを観測し、前後の保存/反映版も一致した時だけ採点する。 */
  async grade(id, input, signal) {
    exact(input, ['runId', 'expectedSourceRevision', 'expectedSourceHash']);
    runId(input.runId);
    expectedRevision(input.expectedSourceRevision);
    if (!/^[a-f0-9]{64}$/u.test(input.expectedSourceHash))
      throw new RequestError(400, 'Source hashが不正です。');
    const run = this.#current;
    if (
      !this.#graderImage ||
      !run?.socket ||
      run.workspaceId !== id ||
      run.record.runId !== input.runId ||
      run.record.state !== 'ready' ||
      run.grading ||
      run.reason
    )
      throw new RequestError(409, '対象runは採点できる状態ではありません。');
    const matches = (source) =>
      source.sourceRevision === input.expectedSourceRevision &&
      source.sourceHash === input.expectedSourceHash &&
      run.record.sourceRevision === source.sourceRevision &&
      run.record.sourceHash === source.sourceHash;
    const cancellation = new globalThis.AbortController();
    const cancelled = () => cancellation.abort();
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) cancellation.abort();
    run.grading = true;
    run.gradeAbort = cancellation;
    let finish;
    run.gradeDone = new Promise((resolve) => {
      finish = resolve;
    });
    try {
      const source = await this.#store.read(id);
      if (!matches(source) || run.reason || cancellation.signal.aborted)
        throw new RequestError(409, '保存版と反映版が一致しません。再反映してください。');
      const result = await this.#engine.gradeProject({
        owner: this.#owner,
        image: this.#graderImage,
        source,
        runId: run.record.runId,
        socket: run.socket,
        signal: cancellation.signal,
      });
      const current = await this.#store.read(id);
      if (
        this.#current !== run ||
        run.reason ||
        run.record.state !== 'ready' ||
        cancellation.signal.aborted ||
        !matches(current)
      )
        throw new RequestError(409, '採点中に実行またはSourceが変わりました。採点していません。');
      for (const [key, value] of Object.entries({
        workspaceId: id,
        runId: run.record.runId,
        sourceRevision: source.sourceRevision,
        sourceHash: source.sourceHash,
      }))
        if (result[key] !== value) throw new Error('Grade identity mismatch');
      run.activityAt = Date.now();
      return result;
    } catch (error) {
      if (!(error instanceof RequestError) || error.status >= 500) {
        this.#slot.recoveryNeeded();
        await this.#cancel(run, 'grade-failed');
      }
      throw error;
    } finally {
      run.grading = false;
      run.gradeAbort = undefined;
      signal?.removeEventListener('abort', cancelled);
      finish();
    }
  }

  async #cancel(run, reason) {
    run.reason ??= reason;
    run.gradeAbort?.abort();
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
      const image = await this.#engine.projectImage(
        run.record.profile === NEXT_PROFILE ? this.#nextImage : this.#image,
      );
      const source = await this.#store.claimRun(run.workspaceId, revision, run.record);
      run.record = source.lastRun;
      claimed = true;
      run.prepared.resolve();
      // 準備待ちの間に停止した場合は、確認済みSource/run記録だけを確定しcreateしない。
      if (run.reason) return;
      if (this.#transport) {
        // prepareの途中で失敗しても、作成を試みた自身のrunディレクトリを回収する。
        run.transportPrepared = true;
        await this.#transport.prepare(run.record.runId);
        if (run.reason) return;
      }
      createAttempted = true;
      const container = await this.#engine.docker(
        'POST',
        '/containers/create',
        this.#engine.projectConfig(
          source,
          this.#owner,
          run.record.runId,
          image,
          Boolean(this.#transport),
        ),
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
            else if (
              (await this.#engine.probeProject(container.Id, {
                profile: source.profile,
                workspaceId: source.workspaceId,
                runId: run.record.runId,
                sourceRevision: source.sourceRevision,
                sourceHash: source.sourceHash,
              })) &&
              !run.reason
            ) {
              if (Date.now() - run.startedAt >= this.#limits.startMs)
                run.reason = 'startup-timeout';
              else {
                if (this.#transport) {
                  run.socket = await this.#transport.seal(run.record.runId);
                  if (run.reason) break;
                  if (Date.now() - run.startedAt >= this.#limits.startMs) {
                    run.reason = 'startup-timeout';
                    break;
                  }
                  run.record.previewUrl =
                    previewOrigin(run.record.runId) +
                    previewBase(run.workspaceId, run.record.runId);
                }
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
        await run.applyDone;
        await run.gradeDone;
        if (run.containerId) await this.#engine.removeContainer(run.containerId);
        // create成功の応答だけ失われた場合もowner labelで実体を回収する。
        else if (createAttempted) await this.#engine.cleanupOwned(this.#owner);
        if (run.transportPrepared) await this.#transport.remove(run.record.runId);
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
