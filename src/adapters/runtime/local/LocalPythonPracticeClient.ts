import { z } from 'zod';
import {
  PYTHON_LESSONS,
  pythonSourceSnapshot,
} from '../../../core/runtime/pythonLessonProfiles.mjs';

const identitySchema = z
  .object({
    runId: z.uuid(),
    sessionId: z.string().max(160),
    executionRevision: z.number().int().nonnegative(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
const snapshotSchema = z
  .object({
    purpose: z.literal('practice'),
    identity: identitySchema,
    phase: z.enum(['preparing', 'running', 'pausing', 'waiting-input', 'resuming', 'ended']),
    reason: z.string().max(64).nullable(),
    inputRequestSequence: z.number().int().min(1).max(17).nullable(),
    inputCount: z.number().int().min(0).max(16),
    inputBytes: z.number().int().min(0).max(1024),
    activeMs: z.number().int().nonnegative(),
    waitingMs: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    stdout: z.string().max(65536),
    stderr: z.string().max(65536),
    removed: z.boolean(),
    recoveryNeeded: z.boolean(),
    purged: z.boolean(),
    exitCode: z.number().int().min(0).max(255).nullable(),
  })
  .strict();

export type PythonPracticeSnapshot = z.infer<typeof snapshotSchema>;
type PracticeIdentity = PythonPracticeSnapshot['identity'];
export interface PythonPracticeRequest {
  readonly exerciseId: string;
  readonly contentRevision: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly files: Readonly<Record<string, string>>;
}

/** 練習専用client。ExecutionService/Validator/進捗Repositoryへ結果を渡さない。 */
export class LocalPythonPracticeClient {
  #token: string | undefined;
  #identity: PracticeIdentity | undefined;
  #creation: Promise<PythonPracticeSnapshot> | undefined;
  #generation = 0;
  #cleanup: Promise<PythonPracticeSnapshot | undefined> = Promise.resolve(undefined);

  async #api(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000);
    try {
      const response = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.#token === undefined ? {} : { 'x-tsumucode-token': this.#token }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      });
      const packet = (await response.json()) as unknown;
      if (!response.ok) {
        const parsed = z.object({ error: z.string().max(4096) }).safeParse(packet);
        throw new Error(parsed.success ? parsed.data.error : '練習APIへ接続できません。');
      }
      return packet;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** ack応答も同じidentityで照合し、controller側の生データ消去を確認する。 */
  async #ack(identity: PracticeIdentity): Promise<PythonPracticeSnapshot> {
    const value = snapshotSchema.parse(
      await this.#api(`practice/runs/${identity.runId}/ack`, { identity }),
    );
    if (
      JSON.stringify(value.identity) !== JSON.stringify(identity) ||
      !value.purged ||
      value.stdout !== '' ||
      value.stderr !== ''
    )
      throw new Error('練習結果の消去を確認できません。学習モードを確認してください。');
    return value;
  }

  /** 現在Sourceを固定し、終了/回収まで同じidentityを照合する。 */
  async start(
    request: PythonPracticeRequest,
    onSnapshot: (value: PythonPracticeSnapshot) => void,
  ): Promise<void> {
    await this.stop();
    const generation = this.#generation;
    const profile = PYTHON_LESSONS[request.exerciseId]?.profile;
    if (profile === undefined) throw new Error('この教材の練習実行には未対応です。');
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(pythonSourceSnapshot(request.files, profile)),
    );
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    this.#token = z
      .object({ apiVersion: z.literal(1), token: z.string().regex(/^[a-f0-9]{64}$/u) })
      .parse(await this.#api('session', {})).token;
    if (generation !== this.#generation) return;
    this.#creation = this.#api('practice/runs', {
      apiVersion: 1,
      runtimeProfileId: 'cpython-values-v1',
      ...request,
    }).then((value) => snapshotSchema.parse(value));
    try {
      let snapshot = await this.#creation;
      if (generation !== this.#generation) return;
      this.#identity = snapshot.identity;
      if (
        snapshot.identity.sessionId !== request.exerciseSessionId ||
        snapshot.identity.executionRevision !== request.executionRevision ||
        snapshot.identity.sourceHash !== hash
      )
        throw new Error('Sourceまたは実行identityが一致しません。');
      const deadline = performance.now() + 75000;
      while (generation === this.#generation && performance.now() < deadline) {
        onSnapshot(snapshot);
        if (snapshot.reason !== null && (snapshot.removed || snapshot.recoveryNeeded)) {
          await this.#ack(snapshot.identity);
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 150));
        if (generation !== this.#generation) return;
        snapshot = snapshotSchema.parse(
          await this.#api(`practice/runs/${snapshot.identity.runId}`, {
            identity: snapshot.identity,
          }),
        );
        if (JSON.stringify(snapshot.identity) !== JSON.stringify(this.#identity))
          throw new Error('別の実行結果を受信しました。');
      }
      if (generation === this.#generation) throw new Error('練習の終了を確認できません。');
    } catch (error) {
      if (generation === this.#generation) await this.stop().catch(() => undefined);
      throw error;
    } finally {
      if (generation !== this.#generation) await this.#cleanup;
      if (generation === this.#generation) {
        this.#identity = undefined;
        this.#creation = undefined;
      }
    }
  }

  /** 送達は消費の証明ではない。同じ要求への再送は行わない。 */
  async send(sequence: number, line?: string, eof = false): Promise<void> {
    const identity = this.#identity;
    if (identity === undefined) throw new Error('練習を開始してください。');
    await this.#api(`practice/runs/${identity.runId}/input`, {
      identity,
      sequence,
      ...(eof ? { eof: true } : { line }),
    });
  }

  /** 作成応答を待ってから中止し、離脱時にも生データを回収する。 */
  stop(): Promise<PythonPracticeSnapshot | undefined> {
    this.#generation += 1;
    const creation = this.#creation;
    const known = this.#identity;
    this.#identity = undefined;
    this.#creation = undefined;
    this.#cleanup = this.#cleanup
      .catch(() => undefined)
      .then(async () => {
        const created = await creation?.catch(() => undefined);
        const identity = known ?? created?.identity;
        if (identity === undefined) return undefined;
        const stopped = snapshotSchema.parse(
          await this.#api(`practice/runs/${identity.runId}/cancel`, { identity }),
        );
        if (
          JSON.stringify(stopped.identity) !== JSON.stringify(identity) ||
          stopped.reason === null ||
          !stopped.removed
        )
          throw new Error(
            '練習の回収を確認できません。Sourceを保存して学習モードを確認してください。',
          );
        return this.#ack(identity);
      });
    return this.#cleanup;
  }
}
