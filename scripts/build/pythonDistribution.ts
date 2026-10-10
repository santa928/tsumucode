import { z } from 'zod';

export const PYTHON_VENDOR_ROOT = 'vendor/python/314.0.7';
export const PYTHON_OUTPUT_ROOT = 'python-runtime/314.0.7';
/** 配布物と原文通知の欠落を拒否する。上流versionの変更時だけ明示更新する。 */
const requiredFiles = [
  'licenses/HACL-NOTICE.txt',
  'licenses/MiniLZ4-NOTICE.txt',
  'licenses/bzip2-LICENSE.txt',
  'licenses/compiler-rt-LICENSE.txt',
  'licenses/cpython-LICENSE.txt',
  'licenses/cpython-third-party.txt',
  'licenses/emscripten-LICENSE.txt',
  'licenses/expat-COPYING.txt',
  'licenses/hiwire-MPL.txt',
  'licenses/libcxx-LICENSE.txt',
  'licenses/libcxxabi-LICENSE.txt',
  'licenses/libffi-LICENSE.txt',
  'licenses/libmpdec-NOTICE.txt',
  'licenses/musl-COPYRIGHT.txt',
  'licenses/pyodide-MPL.txt',
  'licenses/xz-COPYING.txt',
  'licenses/zlib-README.txt',
  'licenses/zstd-LICENSE.txt',
  'pyodide-lock.json',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'pyodide.mjs',
  'python_stdlib.zip',
] as const;
export const PythonDistributionManifestSchema = z
  .array(
    z
      .object({
        file: z.string(),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
  )
  .superRefine((entries, context) => {
    const actual = entries.map(({ file }) => file).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...requiredFiles].sort()))
      context.addIssue({
        code: 'custom',
        message: 'Python固定配布物/原文通知の集合が一致しません',
      });
  });

/** 同梱する変更前JSと編集可能な実行境界/build入力。Git HEADに依存せず配布bytesに結び付く。 */
export const PYTHON_PREFERRED_SOURCE_FILES = [
  'package.json',
  'package-lock.json',
  'scripts/build/pythonDistribution.ts',
  'scripts/build/preparePythonAssets.ts',
  'src/adapters/runtime/python/PythonExecutionService.ts',
  'src/adapters/runtime/python/pythonCapabilities.ts',
  'src/adapters/runtime/python/pythonFrameSource.ts',
  'src/adapters/runtime/python/pythonLessonAnalysis.ts',
  'src/adapters/runtime/python/pythonProtocol.ts',
  'src/adapters/runtime/python/pythonWorker.ts',
  'vendor/python/314.0.7/pyodide.mjs',
  'vendor/python/314.0.7/pyodide.asm.mjs',
  'vendor/python/314.0.7/manifest.json',
] as const;

export function pythonSourceOfferText(): string {
  return [
    'TsumuCode Python入門: Pyodide 314.0.7 / CPython 3.14.2 / Emscripten 5.0.3',
    'Pyodide/hiwireはMPL 2.0。その他の原文通知はlicenses/に同梱しています。',
    '本配布の変更前JS・編集可能な実行境界・build入力は以下のsources/で無償提供します。',
    ...PYTHON_PREFERRED_SOURCE_FILES.map((file) => `sources/${file}`),
    'Pyodide固定ソース・CPython patch・build設定: https://github.com/pyodide/pyodide/tree/314.0.7',
    'hiwire固定ソース: https://github.com/pyodide/hiwire/tree/6a1e67280a15d929ebeceee54a6358c9c8d5f697',
    '第三者のWASM/stdlibは固定配布bytesを保持し、JSはstrict IIFEへのbundleとimport.meta.urlの固定値置換を行っています。',
    '再現: sources/の階層を保持し、vendor/python/314.0.7/へ本配布のcore.wasm→pyodide.asm.wasm、stdlib.zip→python_stdlib.zip、lock.json→pyodide-lock.jsonとlicenses/を戻します。',
    'Docker内でnpm ci、npm run build:python-assetsを実行します。package-lock.jsonで依存を固定します。',
    '教材と図はTsumuCode独自制作です。第三者coreの著者・商標による推薦を表すものではありません。',
    '',
  ].join('\n');
}

export function pythonNoticesHtml(files: readonly string[]): string {
  return [
    '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    '<title>Python実行環境のライセンスと対象ソース</title><main><h1>Python実行環境のライセンスと対象ソース</h1>',
    '<p>Pyodide 314.0.7 / Python 3.14.2</p><p><a href="SOURCES.txt">対象ソース・変更内容・再現手順の入手案内</a></p><ul>',
    ...files
      .filter((file) => file.startsWith('licenses/'))
      .map((file) => `<li><a href="${file}">${file.slice('licenses/'.length)}</a></li>`),
    '</ul></main></html>\n',
  ].join('\n');
}
