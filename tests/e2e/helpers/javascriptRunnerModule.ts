import { readFile } from 'node:fs/promises';
import { testServerUrl } from './testBasePath';

/** build済みVite manifestから同一originのJavaScript Runner entryを解決する。 */
export async function loadJavaScriptRunnerModulePath(): Promise<string> {
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Readonly<
    Record<string, { readonly file?: unknown }>
  >;
  const file = manifest['src/adapters/runtime/javascript/index.ts']?.file;
  if (typeof file !== 'string') {
    throw new Error('JavaScript Runner entryがVite manifestにありません');
  }
  return new URL(file, testServerUrl(4173)).href;
}
