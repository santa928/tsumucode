import {
  PYTHON_LESSONS,
  validPythonInputLines,
} from '../../../core/runtime/pythonLessonProfiles.mjs';
import { z } from 'zod';
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionService,
} from '../../../core/runtime/contracts';

const resultSchema = z.object({
  runId: z.string(),
  exerciseSessionId: z.string(),
  executionRevision: z.number().int().nonnegative(),
  backend: z.literal('local'),
  engine: z.enum(['node', 'cpython']),
  engineVersion: z.string().max(80),
  exitCode: z.number().int().min(0).max(255).nullable(),
  status: z.enum(['succeeded', 'code-error', 'unsupported', 'stopped', 'system-error']),
  diagnostics: z
    .array(
      z.object({
        code: z.string().max(128),
        kind: z.enum(['syntax', 'reference', 'unsupported', 'system']),
        severity: z.enum(['warning', 'error']),
        message: z.string().max(4096),
        learnerMessage: z.string().max(4096),
      }),
    )
    .max(16),
  evidence: z
    .array(
      z.object({
        id: z.string().max(128),
        file: z.string().max(256).optional(),
        value: z.union([z.string().max(65536), z.number(), z.boolean()]),
      }),
    )
    .max(64),
  console: z
    .array(
      z.object({
        sequence: z.number().int().nonnegative(),
        level: z.enum(['log', 'info', 'warn', 'error']),
        text: z.string().max(65536),
      }),
    )
    .max(65536),
});

interface ActiveRun {
  readonly request: ExecutionRequest;
  readonly created: Promise<void>;
}

/** 固定Node/CPython profileの実行・identity照合・停止回収を共通のHTTP契約で扱う。 */
export class LocalConsoleExecutionService implements ExecutionService {
  readonly languageId: 'javascript' | 'python';
  readonly environment: ExecutionService['environment'];
  #token: string | undefined;
  #generation = 0;
  #disposed = false;
  #cleanup: Promise<void> = Promise.resolve();
  #active: ActiveRun | undefined;

  constructor(
    private readonly exerciseId: string,
    private readonly contentRevision: string,
    private readonly engine: 'node' | 'cpython',
    private readonly readInputLines: () => readonly string[] = () => [],
  ) {
    this.languageId = engine === 'cpython' ? 'python' : 'javascript';
    this.environment = { backend: 'local', engine, mode: 'console', capabilities: ['console'] };
  }

  /** tokenはinstanceのメモリだけに保持し、HTTP異常を採点対象外として呼出側へ返す。 */
  async #api(path: string, body: unknown = {}): Promise<unknown> {
    const response = await fetch(`/api/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(this.#token === undefined ? {} : { 'X-Tsumucode-Token': this.#token }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) throw new Error('実行結果が大きすぎます。');
    const value: unknown = JSON.parse(text);
    if (!response.ok) {
      const error = z.object({ error: z.string().max(4096) }).safeParse(value);
      throw new Error(error.success ? error.data.error : 'ローカル実行環境に接続できません。');
    }
    return value;
  }

  /** 各実行で接続・教材版を照合し、controller再起動後も明示再実行で復旧する。 */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const generation = ++this.#generation;
    const result = (
      status: 'stopped' | 'system-error' | 'unsupported',
      message: string,
    ): ExecutionResult => ({
      runId: request.runId,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      backend: 'local',
      engine: this.engine,
      status,
      evidence: [],
      console: [],
      diagnostics: [
        {
          code: `local-${status}`,
          kind: status === 'unsupported' ? 'unsupported' : 'system',
          severity: 'error',
          message,
          learnerMessage: message,
        },
      ],
    });
    const stale = (): boolean => this.#disposed || generation !== this.#generation;
    const stopped = (): ExecutionResult =>
      result('stopped', '実行を停止しました。採点していません。');
    const fixedGrade = this.engine === 'cpython' && request.options.purpose === 'grade';
    const inputLines =
      this.engine === 'cpython' && !fixedGrade ? [...this.readInputLines()] : undefined;
    if (inputLines !== undefined && !validPythonInputLines(inputLines))
      return result('unsupported', '入力は16行・1 KiB以内にしてください。採点していません。');
    let active: ActiveRun | undefined;
    try {
      // 切断中の停止失敗を永久エラーにしない。新要求の排他・孤児回収はcontrollerが強制する。
      await this.#cleanup.catch(() => undefined);
      if (stale()) return stopped();
      if (request.requiredCapabilities.some((capability) => capability !== 'console'))
        return result('unsupported', 'この環境ではDOM操作に未対応です。採点していません。');
      if (
        request.backend !== 'local' ||
        request.engine !== this.engine ||
        request.languageId !== this.languageId
      )
        throw new Error('実行環境が一致しません。');
      this.#token = z
        .object({ apiVersion: z.literal(1), token: z.string().regex(/^[a-f0-9]{64}$/u) })
        .parse(await this.#api('session')).token;
      if (stale()) return stopped();
      const capability = z
        .object({
          apiVersion: z.literal(1),
          exerciseIds: z
            .array(z.string().max(160))
            .max(this.engine === 'cpython' ? Object.keys(PYTHON_LESSONS).length : 4)
            .optional(),
          contentRevision: z.string(),
          courseRevisions: z
            .object({
              'python-basics': z.string(),
              'python-practice': z.string(),
              'python-oop': z.string().optional(),
            })
            .strict()
            .optional(),
          runtimeProfileId: z.literal(
            this.engine === 'cpython' ? 'cpython-values-v1' : 'node-closure-v1',
          ),
          ...(this.engine === 'cpython' ? { engineVersion: z.literal('3.14.2') } : {}),
        })
        .parse(await this.#api(this.engine === 'cpython' ? 'python-capabilities' : 'capabilities'));
      if (stale()) return stopped();
      if (!capability.exerciseIds?.includes(this.exerciseId))
        return result(
          'unsupported',
          'このローカル環境では未対応の演習です。コードを保存して学習モードを再起動してください。採点していません。',
        );
      const pythonCourse =
        this.engine === 'cpython' ? PYTHON_LESSONS[this.exerciseId]?.courseId : undefined;
      const expectedRevision = pythonCourse
        ? capability.courseRevisions?.[pythonCourse]
        : capability.contentRevision;
      if (expectedRevision !== this.contentRevision)
        throw new Error('教材の版が異なります。コードを保存して学習モードを再起動してください。');
      const created = this.#api(fixedGrade ? 'grades' : 'runs', {
        apiVersion: 1,
        exerciseId: this.exerciseId,
        contentRevision: this.contentRevision,
        runtimeProfileId: capability.runtimeProfileId,
        runId: request.runId,
        exerciseSessionId: request.exerciseSessionId,
        executionRevision: request.executionRevision,
        files: request.files,
        ...(inputLines === undefined ? {} : { inputLines }),
      }).then(() => undefined);
      active = { request, created };
      this.#active = active;
      await created;
      const deadline = performance.now() + (fixedGrade ? 90000 : 15000);
      while (performance.now() < deadline) {
        if (stale()) return stopped();
        const response = z
          .discriminatedUnion('state', [
            z.object({ state: z.literal('running') }),
            z.object({ state: z.literal('completed'), result: resultSchema }),
          ])
          .parse(await this.#api(`runs/${encodeURIComponent(request.runId)}`));
        if (stale()) return stopped();
        if (response.state === 'completed') {
          const executed = response.result;
          if (
            executed.engine !== this.engine ||
            (this.engine === 'cpython' && executed.engineVersion !== '3.14.2') ||
            executed.runId !== request.runId ||
            executed.exerciseSessionId !== request.exerciseSessionId ||
            executed.executionRevision !== request.executionRevision
          )
            throw new Error('古い実行結果を受信したため採点していません。');
          return {
            ...executed,
            evidence: executed.evidence.map(({ file, ...item }) =>
              file === undefined ? item : { ...item, file },
            ),
          };
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 150);
        });
      }
      await this.#api(`runs/${encodeURIComponent(request.runId)}/cancel`);
      return result(
        'system-error',
        '実行結果を取得できませんでした。編集内容を残して再実行してください。',
      );
    } catch (error: unknown) {
      return stale()
        ? stopped()
        : result(
            'system-error',
            `ローカル実行に失敗しました。Dockerと学習モードを確認して再実行してください。${error instanceof Error ? error.message : ''}`,
          );
    } finally {
      if (this.#active === active) this.#active = undefined;
    }
  }

  /** 作成中の要求も完了を待って同じrunを中止し、次のexecuteより先に回収を待つ。 */
  stop(): Promise<void> {
    this.#generation += 1;
    const active = this.#active;
    this.#cleanup = this.#cleanup
      .catch(() => undefined)
      .then(async () => {
        if (active === undefined) return;
        await active.created;
        const response = z
          .object({ state: z.literal('completed'), result: resultSchema })
          .parse(await this.#api(`runs/${encodeURIComponent(active.request.runId)}/cancel`));
        const result = response.result;
        if (
          result.status === 'system-error' ||
          result.engine !== this.engine ||
          result.runId !== active.request.runId ||
          result.exerciseSessionId !== active.request.exerciseSessionId ||
          result.executionRevision !== active.request.executionRevision
        )
          throw new Error('停止・回収を確認できません。Dockerと学習モードを確認してください。');
      });
    return this.#cleanup;
  }

  /** 画面離脱では再利用を禁止し、進行中runを停止する。 */
  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.stop();
    this.#token = undefined;
  }
}
