import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';
import { createReactTypeCheckSeed } from '../../src/adapters/runtime/typescript/compileTypeScript.ts';

const MODULE_ID = 'virtual:tsumucode-react-typecheck-seed';
const require = createRequire(import.meta.url);

/** 固定lockの宣言を全検査した増分情報だけをWorkerへ同梱する。 */
export function reactTypeCheckSeedPlugin(): Plugin {
  let operation: Promise<string> | undefined;
  return {
    name: 'tsumucode-react-typecheck-seed',
    resolveId(id) {
      return id === MODULE_ID ? '\0' + MODULE_ID : undefined;
    },
    async load(id) {
      if (id !== '\0' + MODULE_ID) return;
      operation ??= (async () => {
        const libraryDirectory = path.dirname(require.resolve('typescript'));
        const libraries = Object.fromEntries(
          await Promise.all(
            (await readdir(libraryDirectory))
              .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
              .map(
                async (name) =>
                  [name, await readFile(path.join(libraryDirectory, name), 'utf8')] as const,
              ),
          ),
        );
        const declarations: Record<string, string> = {};
        for (const [packageName, files] of [
          ['@types/react', ['index.d.ts', 'global.d.ts', 'jsx-runtime.d.ts']],
          ['@types/react-dom', ['index.d.ts', 'client.d.ts']],
          ['csstype', ['index.d.ts']],
        ] as const) {
          const directory = path.dirname(require.resolve(packageName + '/package.json'));
          for (const file of files) {
            declarations[packageName.replace('@types/', '') + '/' + file] = await readFile(
              path.join(directory, file),
              'utf8',
            );
          }
        }
        return JSON.stringify(await createReactTypeCheckSeed(libraries, declarations));
      })();
      return 'export default ' + (await operation) + ';';
    },
  };
}
