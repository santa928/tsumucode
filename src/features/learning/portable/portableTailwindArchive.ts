import { strToU8, zipSync } from 'fflate';
import { validateHtmlCssPreviewInput } from '../../../adapters/runtime/preview-kernel/prepareHtmlCssPreview';
import { validateTailwindSource } from '../../../adapters/runtime/tailwind/validateSource';
import { downloadArchive } from './downloadArchive';
import manifest from './tailwind-project/package.json?raw';
import lock from './tailwind-project/package-lock.json?raw';
import config from './tailwind-project/vite.config.mjs?raw';
import readme from './tailwind-project/README.md?raw';

const packaging = {
  'package.json': manifest,
  'package-lock.json': lock,
  'vite.config.mjs': config,
  'README.md': readme,
} as const;

/**
 * 固定2ソースを検証し、クリック時点の原文とVite用の固定包装を保持する。
 * 保存・採点は行わない。余分なFileや外部buildで解釈が変わる入力は例外にする。
 */
export function createPortableTailwindArchive(
  files: Readonly<Record<string, string | undefined>>,
): Uint8Array<ArrayBuffer> {
  const html = Object.hasOwn(files, 'index.html') ? files['index.html'] : undefined;
  const css = Object.hasOwn(files, 'styles.css') ? files['styles.css'] : undefined;
  if (Object.keys(files).length !== 2 || typeof html !== 'string' || typeof css !== 'string') {
    throw new Error('制作のindex.htmlとstyles.cssだけをそろえてください。');
  }
  const source = { 'index.html': html, 'styles.css': css };
  const input = {
    languageId: 'tailwind' as const,
    exerciseSessionId: 'portable-tailwind-project',
    executionRevision: 0,
    files: source,
    assets: [],
    viewport: { id: 'desktop', width: 800, height: 600 },
    options: {
      runtime: {
        kind: 'tailwind',
        entryFile: 'index.html',
        sourceType: 'script',
        capabilityProfile: 'project',
        primaryOutput: 'preview',
        profile: 'theme-project-v1',
      },
    },
  };
  const diagnostics = validateTailwindSource(validateHtmlCssPreviewInput(input, 'tailwind'), input);
  if (diagnostics.length > 0) {
    throw new Error(
      '未対応のclassを確認してください。サイトで表示できる制作Sourceを持ち出します。',
    );
  }
  const entries = Object.fromEntries(
    Object.entries({ ...source, ...packaging }).map(([path, content]) => [path, strToU8(content)]),
  );
  return new Uint8Array(zipSync(entries, { level: 0 }));
}

/** 学習者入力をファイル名へ使わず、制作専用名でダウンロードする。 */
export function downloadPortableTailwindArchive(archive: Uint8Array<ArrayBuffer>): void {
  downloadArchive(archive, 'tsumucode-tailwind-reading-cards.zip');
}
