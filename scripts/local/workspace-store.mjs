import { mkdir, readdir, lstat, readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RequestError } from './protocol.mjs';
import {
  PROJECT_PROFILE,
  PROJECT_LIMITS,
  STARTER_FILES,
  workspaceId,
  expectedRevision,
  validateFiles,
  projectHash,
} from './project-protocol.mjs';

/** controller専用directoryへSourceを保存する。全更新を同じ列で直列化し、CASを守る。 */
export class WorkspaceStore {
  #directory;
  #queue = Promise.resolve();

  constructor(directory) {
    this.#directory = directory;
  }

  #serial(operation) {
    const result = this.#queue.then(operation);
    this.#queue = result.catch(() => {});
    return result;
  }

  async #prepare() {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.#directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid Source directory');
  }

  async #read(id) {
    const path = join(this.#directory, `${workspaceId(id)}.json`);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
        throw new Error('Invalid Source file');
      const record = JSON.parse(await readFile(path, 'utf8'));
      if (
        record.schema !== 1 ||
        record.profile !== PROJECT_PROFILE ||
        record.workspaceId !== id ||
        expectedRevision(record.sourceRevision) === 0 ||
        projectHash(validateFiles(record.files)) !== record.sourceHash
      )
        throw new Error('Invalid Source record');
      return record;
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async #write(record) {
    const path = join(this.#directory, `${record.workspaceId}.json`);
    const temporary = join(this.#directory, `.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(record));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
      const directory = await open(this.#directory, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return record;
  }

  read(id) {
    workspaceId(id);
    return this.#serial(async () => {
      await this.#prepare();
      const record = await this.#read(id);
      if (!record) throw new RequestError(404, 'Workspaceがありません。');
      return record;
    });
  }

  save(id, revision, files) {
    workspaceId(id);
    expectedRevision(revision);
    const source = validateFiles(files);
    return this.#serial(async () => {
      await this.#prepare();
      const previous = await this.#read(id);
      if ((previous?.sourceRevision ?? 0) !== revision)
        throw new RequestError(409, 'Source版が更新されています。再取得してください。');
      if (!previous) {
        const names = await readdir(this.#directory);
        if (
          names.filter((name) => /^[a-z0-9-]+\.json$/u.test(name)).length >=
          PROJECT_LIMITS.workspaces
        )
          throw new RequestError(409, '保存可能なWorkspaceは16件までです。');
      }
      return this.#write({
        schema: 1,
        profile: PROJECT_PROFILE,
        workspaceId: id,
        sourceRevision: revision + 1,
        sourceHash: projectHash(source),
        files: source,
        lastRun: previous?.lastRun ?? null,
      });
    });
  }

  reset(id, revision) {
    if (revision === 0) throw new RequestError(404, 'Workspaceがありません。');
    return this.save(id, revision, STARTER_FILES);
  }

  /** 起動の版検査とrun記録を不可分にし、途中の保存を古い版で起動しない。 */
  claimRun(id, revision, run) {
    return this.#serial(async () => {
      await this.#prepare();
      const record = await this.#read(id);
      if (!record) throw new RequestError(404, 'Workspaceがありません。');
      if (record.sourceRevision !== revision)
        throw new RequestError(409, 'Source版が更新されています。再取得してください。');
      if (record.lastRun?.runId === run.runId)
        throw new RequestError(409, '同じ実行IDは再利用できません。');
      return this.#write({
        ...record,
        lastRun: {
          ...run,
          sourceRevision: record.sourceRevision,
          sourceHash: record.sourceHash,
        },
      });
    });
  }

  /** 遅れた旧run終了は無視する。run更新は最新Sourceを読み直して版を巻き戻さない。 */
  updateRun(id, run, previousRunId = run.runId) {
    return this.#serial(async () => {
      await this.#prepare();
      const record = await this.#read(id);
      if (!record) throw new RequestError(404, 'Workspaceがありません。');
      if (previousRunId !== null && record.lastRun?.runId !== previousRunId) return record;
      return this.#write({ ...record, lastRun: run });
    });
  }

  /** 起動時に古いreadyを無効化する。孤児の回収成功後にだけ呼ぶ。 */
  recover() {
    return this.#serial(async () => {
      await this.#prepare();
      for (const name of await readdir(this.#directory)) {
        if (!/^[a-z0-9-]+\.json$/u.test(name)) continue;
        const record = await this.#read(name.slice(0, -5));
        if (
          ['starting', 'ready', 'stopping'].includes(record.lastRun?.state) ||
          record.lastRun?.cleanupPending
        )
          await this.#write({
            ...record,
            lastRun: {
              ...record.lastRun,
              state: 'stopped',
              reason: 'controller-restarted',
              cleanupPending: false,
            },
          });
      }
    });
  }
}
