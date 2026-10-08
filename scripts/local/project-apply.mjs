import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { NEXT_PROFILE, nextWorkspace } from './next-project-protocol.mjs';

// controllerが検査した教材ごとの固定fileだけを、shellを介さずrunのtmpfsへ反映する。
const { files, metadata } = JSON.parse(
  Buffer.from(process.argv.slice(2).join(''), 'base64').toString('utf8'),
);
const next = metadata.profile === NEXT_PROFILE;
const root = next ? '/opt/workspace' : '/workspace';
const names = next
  ? Object.keys(nextWorkspace(metadata.workspaceId).files)
  : ['index.html', 'main.js', 'message.js', 'styles.css'];
if (
  Object.keys(files).length !== names.length ||
  names.some((name) => typeof files[name] !== 'string')
)
  throw new Error('Invalid project files');

async function replace(path, content) {
  const previous = await lstat(path);
  if (!previous.isFile() || previous.isSymbolicLink()) throw new Error('Invalid project file');
  // 未変更HTML/mainを触るとViteが全reloadするため、変更したfileだけを反映する。
  if ((await readFile(path, 'utf8')) === content) return;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(content);
    } finally {
      await file.close();
    }
    // destinationのsymlinkは辿らず、固定mount内の名前そのものを置換する。
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

for (const name of names) await replace(`${root}/${name}`, files[name]);
// file集合全体の原子性は主張しない。管理側はこのmarker一致までapplyingを保つ。
await replace('/tmp/applied.json', JSON.stringify(metadata));
