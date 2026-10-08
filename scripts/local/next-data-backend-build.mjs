import { writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import process from 'node:process';
import { URL, pathToFileURL } from 'node:url';
import { nextWorkspace } from './next-project-protocol.mjs';

/** readonly API正本をimage作成時に変換し、保存版ごとに作れるfactoryを生成する。 */
export function compileNextDataBackends() {
  const compiled = {};
  for (const [workspace, kind] of [
    ['next-ch03-l01-e01', 'sample'],
    ['next-ch03-l02-e01', 'weather'],
  ]) {
    const fixed = nextWorkspace(workspace).files[`app/api/${kind}/route.ts`];
    const factory =
      'export function createBackend() {\n' + fixed.replace(/^export /gmu, '') + '\nreturn GET;\n}';
    compiled[workspace] = stripTypeScriptTypes(factory);
  }
  return compiled;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(
    new URL('./next-data-api.json', import.meta.url),
    JSON.stringify(compileNextDataBackends()),
  );
}
