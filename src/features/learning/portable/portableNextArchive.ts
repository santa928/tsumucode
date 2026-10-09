import { downloadArchive } from './downloadArchive';
/** 制作2教材の現在Sourceと固定包装だけを、サイト外で再現できるZIPにする。 */
import { strToU8, zipSync } from 'fflate';
import { nextWorkspace } from '../../../../scripts/local/next-project-protocol.mjs';
import packaging from '../../../../scripts/local/next-portable-packaging.json';

const workspaces = ['next-ch05-l01-e01', 'next-ch06-l01-e01'];
export const PORTABLE_NEXT_SOURCE_BYTE_LIMIT = 100 * 1024;

/** 進捗・実行identityを受け取らず、固定名の完全なSourceだけを保持する。 */
export function createPortableNextArchive(
  workspaceId: string,
  files: Readonly<Record<string, string>>,
): Uint8Array<ArrayBuffer> {
  const contract = nextWorkspace(workspaceId);
  if (!workspaces.includes(workspaceId) || !contract) throw new Error('持ち出し未対応の教材です。');
  const paths = Object.keys(contract.files);
  if (
    Object.keys(files).length !== paths.length ||
    paths.some((path) => !Object.hasOwn(files, path) || typeof files[path] !== 'string')
  ) {
    throw new Error('制作Sourceがそろっていません。画面を開き直してください。');
  }
  if (contract.readonlyFiles?.some((path) => files[path] !== contract.files[path])) {
    throw new Error('固定データとAssetが一致しません。画面を開き直してください。');
  }
  const entries: Record<string, Uint8Array> = {};
  let bytes = 0;
  for (const path of paths) {
    const source = strToU8(files[path]!);
    bytes += source.byteLength;
    if (bytes > PORTABLE_NEXT_SOURCE_BYTE_LIMIT)
      throw new Error('Sourceは合計100 KiB以下にしてください。');
    entries[path] = source;
  }
  for (const [path, source] of Object.entries(packaging)) entries[path] = strToU8(source);
  return new Uint8Array(zipSync(entries, { level: 0 }));
}

/** 固定2教材の名前だけを使い、利用者入力をDownload属性へ流さない。 */
export function downloadPortableNextArchive(
  workspaceId: string,
  archive: Uint8Array<ArrayBuffer>,
): void {
  if (!workspaces.includes(workspaceId)) throw new Error('持ち出し未対応の教材です。');
  downloadArchive(archive, `tsumucode-${workspaceId}.zip`);
}
