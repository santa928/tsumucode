import { readFile } from 'node:fs/promises';
import { testServerUrl } from './testBasePath';

/** build済みVite manifestから同一originのdynamic entryを解決する。 */
async function loadJavaScriptModulePath(sourcePath: string): Promise<string> {
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Readonly<
    Record<string, { readonly file?: unknown }>
  >;
  const file = manifest[sourcePath]?.file;
  if (typeof file !== 'string') {
    throw new Error(`JavaScript entryがVite manifestにありません: ${sourcePath}`);
  }
  return new URL(file, testServerUrl(4173)).href;
}

/** build済みVite manifestから同一originのJavaScript Runner entryを解決する。 */
export function loadJavaScriptRunnerModulePath(): Promise<string> {
  return loadJavaScriptModulePath('src/adapters/runtime/javascript/index.ts');
}

/** build済みVite manifestから同一originのJavaScript Validator entryを解決する。 */
export function loadJavaScriptValidatorModulePath(): Promise<string> {
  return loadJavaScriptModulePath('src/adapters/validation/javascript/index.ts');
}
