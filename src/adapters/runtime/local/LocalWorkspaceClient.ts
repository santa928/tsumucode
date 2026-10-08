/** Local専用画面のSource・runを検証する。管理tokenはinstanceのメモリだけに保持する。 */
import { z } from 'zod';

const profile = z.literal('vite-project-v1');
const revision = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const workspaceId = z.string().regex(/^[a-z0-9-]{1,64}$/u);
const runId = z.uuid({ version: 'v4' });
const source = z.string().max(100 * 1024);

export const workspaceFilesSchema = z
  .object({ 'index.html': source, 'main.js': source, 'message.js': source, 'styles.css': source })
  .strict()
  .refine(
    (files) =>
      Object.values(files).reduce(
        (size, text) => size + new TextEncoder().encode(text).length,
        0,
      ) <=
      100 * 1024,
    'Sourceは合計100 KiB以下にしてください。',
  );

const workspaceRunSchema = z.object({
  workspaceId,
  profile,
  runId,
  sourceRevision: revision,
  sourceHash: hash,
  state: z.enum(['starting', 'ready', 'applying', 'stopping', 'stopped', 'failed', 'idle']),
  cleanupPending: z.boolean(),
  previewUrl: z.string().max(512).optional(),
  reason: z.string().max(128).optional(),
});

const workspaceSchema = z.object({
  schema: z.literal(1),
  profile,
  workspaceId,
  sourceRevision: revision,
  sourceHash: hash,
  files: workspaceFilesSchema,
  lastRun: workspaceRunSchema.nullable(),
});

const capabilitiesSchema = z.object({
  apiVersion: z.literal(1),
  profile,
  available: z.boolean(),
  gradingAvailable: z.literal(true),
  starterFiles: workspaceFilesSchema,
});

export type WorkspaceFiles = z.infer<typeof workspaceFilesSchema>;
export type WorkspaceRun = z.infer<typeof workspaceRunSchema>;
export type LocalWorkspace = z.infer<typeof workspaceSchema>;

const gradeSchema = z.object({
  profile,
  workspaceId,
  runId,
  sourceRevision: revision,
  sourceHash: hash,
  status: z.enum(['pass', 'incomplete', 'code-error']),
  actual: z.string().max(512),
  diagnostics: z.array(z.string().max(512)).max(8),
  engineVersion: z.string().max(80),
  evaluatedAt: z.iso.datetime(),
});
export type WorkspaceGrade = z.infer<typeof gradeSchema>;

export class LocalWorkspaceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LocalWorkspaceApiError';
  }
}

/** learnerから届くURL/metadataを信用せず、controllerのrun identityからPreviewを組み立てる。 */
export function workspacePreviewUrl(run: WorkspaceRun): string | undefined {
  if (run.previewUrl === undefined) return undefined;
  const expected = `http://${run.runId}.localhost:4175/w/${run.workspaceId}/${run.runId}/`;
  if (run.previewUrl !== expected) throw new Error('Previewと実行情報が一致しません。');
  return expected;
}

/** 同じWorkspaceの応答だけを返し、旧runの停止/反映応答を新runへ採用しない。 */
export class LocalWorkspaceClient {
  #token: string | undefined;
  readonly #path: string;

  constructor(readonly id: string) {
    workspaceId.parse(id);
    this.#path = `/api/workspaces/${id}`;
  }

  async #request(path: string, body: unknown = {}): Promise<unknown> {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: path.endsWith('/stop'),
      headers: {
        'content-type': 'application/json',
        ...(this.#token === undefined ? {} : { 'x-tsumucode-token': this.#token }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error('Workspace応答が大きすぎます。');
    const value: unknown = JSON.parse(text);
    if (!response.ok) {
      const parsed = z.object({ error: z.string().max(4096) }).safeParse(value);
      throw new LocalWorkspaceApiError(
        response.status,
        parsed.success ? parsed.data.error : 'ローカル学習環境へ接続できません。',
      );
    }
    return value;
  }

  #run(input: unknown, expectedRunId?: string): WorkspaceRun {
    const run = workspaceRunSchema.parse(input);
    if (run.workspaceId !== this.id || (expectedRunId !== undefined && run.runId !== expectedRunId))
      throw new Error('別Workspaceまたは古い実行の応答を受信しました。');
    workspacePreviewUrl(run);
    return run;
  }

  #workspace(input: unknown, expectedRunId?: string): LocalWorkspace {
    const workspace = workspaceSchema.parse(input);
    if (workspace.workspaceId !== this.id) throw new Error('別Workspaceの応答を受信しました。');
    if (expectedRunId !== undefined && workspace.lastRun?.runId !== expectedRunId)
      throw new Error('古い実行の応答を受信しました。');
    if (workspace.lastRun !== null) this.#run(workspace.lastRun, expectedRunId);
    return workspace;
  }

  /** 明示接続/再接続時だけbootstrapし、controller再起動後は新tokenで状態を読む。 */
  async connect(): Promise<z.infer<typeof capabilitiesSchema>> {
    this.#token = undefined;
    this.#token = z
      .object({ apiVersion: z.literal(1), token: z.string().regex(/^[a-f0-9]{64}$/u) })
      .parse(await this.#request('/api/session')).token;
    const capabilities = capabilitiesSchema.parse(
      await this.#request('/api/workspaces/capabilities'),
    );
    if (!capabilities.available) throw new Error('この環境では固定Projectを起動できません。');
    return capabilities;
  }

  async status(): Promise<LocalWorkspace | undefined> {
    try {
      return this.#workspace(await this.#request(this.#path));
    } catch (error: unknown) {
      if (error instanceof LocalWorkspaceApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  async save(expectedSourceRevision: number, files: WorkspaceFiles): Promise<LocalWorkspace> {
    z.number().int().nonnegative().parse(expectedSourceRevision);
    workspaceFilesSchema.parse(files);
    return this.#workspace(
      await this.#request(`${this.#path}/source`, { expectedSourceRevision, files }),
    );
  }

  async start(expectedSourceRevision: number): Promise<WorkspaceRun> {
    revision.parse(expectedSourceRevision);
    return this.#run(await this.#request(`${this.#path}/start`, { expectedSourceRevision }));
  }

  async apply(run: WorkspaceRun, saved: LocalWorkspace): Promise<LocalWorkspace> {
    this.#run(run);
    this.#workspace(saved);
    return this.#workspace(
      await this.#request(`${this.#path}/apply`, {
        runId: run.runId,
        expectedSourceRevision: saved.sourceRevision,
        expectedSourceHash: saved.sourceHash,
      }),
      run.runId,
    );
  }

  async stop(run: WorkspaceRun): Promise<LocalWorkspace> {
    this.#run(run);
    return this.#workspace(
      await this.#request(`${this.#path}/stop`, { runId: run.runId }),
      run.runId,
    );
  }

  async activity(run: WorkspaceRun): Promise<void> {
    this.#run(run);
    await this.#request(`${this.#path}/activity`, { runId: run.runId });
  }

  async grade(run: WorkspaceRun, saved: LocalWorkspace): Promise<WorkspaceGrade> {
    this.#run(run);
    this.#workspace(saved);
    const result = gradeSchema.parse(
      await this.#request(`${this.#path}/grade`, {
        runId: run.runId,
        expectedSourceRevision: saved.sourceRevision,
        expectedSourceHash: saved.sourceHash,
      }),
    );
    if (
      result.workspaceId !== this.id ||
      result.runId !== run.runId ||
      result.sourceRevision !== saved.sourceRevision ||
      result.sourceHash !== saved.sourceHash
    )
      throw new Error('採点結果とWorkspace・実行版が一致しません。');
    return result;
  }
}
