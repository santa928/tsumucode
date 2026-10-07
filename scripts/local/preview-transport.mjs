import { chmod, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { TRANSPORT_ROOT, previewRunId } from './preview-contract.mjs';

/** run専用Subpathの作成・seal・回収を扱う。controller user 0:1000専用。 */
export class PreviewTransport {
  #path(runId) {
    return join(TRANSPORT_ROOT, previewRunId(runId));
  }

  async #root() {
    const root = await lstat(TRANSPORT_ROOT);
    if (!root.isDirectory() || root.uid !== 0 || root.gid !== 1000 || root.mode & 0o027)
      throw new Error('Unsafe transport root');
  }

  /** 自身のlearnerを先に回収したcontrollerだけが残存runを削除する。 */
  async recover() {
    await this.#root();
    for (const name of await readdir(TRANSPORT_ROOT)) {
      previewRunId(name);
      await this.remove(name);
    }
  }

  async prepare(runId) {
    await this.#root();
    const path = this.#path(runId);
    await mkdir(path, { mode: 0o700 });
    // umaskに依存せず、socket作成に必要なgroup権限を固定する。
    await chmod(path, 0o770);
  }

  /** socket作成後の親をsealし、接続先のunlink/rename/symlink差替えを防ぐ。 */
  async seal(runId) {
    await this.#root();
    const path = this.#path(runId);
    const parent = await lstat(path);
    const before = await lstat(join(path, 'http.sock'));
    if (
      !parent.isDirectory() ||
      parent.uid !== 0 ||
      parent.gid !== 1000 ||
      !before.isSocket() ||
      before.uid !== 1000 ||
      before.gid !== 1000 ||
      before.mode & 0o007
    )
      throw new Error('Unsafe transport socket');
    await chmod(path, 0o550);
    const sealed = await lstat(path);
    const after = await lstat(join(path, 'http.sock'));
    if (
      !sealed.isDirectory() ||
      sealed.uid !== 0 ||
      sealed.gid !== 1000 ||
      sealed.mode & 0o222 ||
      !after.isSocket() ||
      after.uid !== 1000 ||
      after.gid !== 1000 ||
      after.mode & 0o007 ||
      after.dev !== before.dev ||
      after.ino !== before.ino
    )
      throw new Error('Transport changed during seal');
    return { dev: after.dev, ino: after.ino };
  }

  /** container削除の確認後だけ親を開き直す。実行中のunsealは禁止する。 */
  async remove(runId) {
    const path = this.#path(runId);
    const parent = await lstat(path).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!parent) return;
    if (!parent.isDirectory() || parent.uid !== 0 || parent.gid !== 1000)
      throw new Error('Unsafe transport cleanup');
    await chmod(path, 0o700);
    await rm(path, { recursive: true, force: true });
  }
}
