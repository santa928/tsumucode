import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createPortableTailwindArchive } from './portableTailwindArchive';

const files = Object.freeze({
  'index.html': `<!doctype html>
<html lang="ja"><head><title>途中の読書メモ</title>
<link rel="stylesheet" href="styles.css"></head>
<body><section class="note-card">読む</section></body></html>\n`,
  'styles.css': `@import "tailwindcss";
@theme {
  --color-brand: #000000;
  --color-paper: #ffffff;
  --spacing-card: 8px;
}
@layer components {
  .note-card { @apply p-2 border border-brand bg-paper text-brand; }
}\n`,
});

describe('Tailwind制作の持ち出し', () => {
  it('途中の原文2ファイルと固定build設定だけをZIPへ保持する', () => {
    const entries = unzipSync(createPortableTailwindArchive(files));
    expect(Object.keys(entries).sort()).toEqual([
      'README.md',
      'index.html',
      'package-lock.json',
      'package.json',
      'styles.css',
      'vite.config.mjs',
    ]);
    expect(strFromU8(entries['index.html']!)).toBe(files['index.html']);
    expect(strFromU8(entries['styles.css']!)).toBe(files['styles.css']);
    const manifest = JSON.parse(strFromU8(entries['package.json']!)) as {
      devDependencies: Record<string, string>;
      engines: { node: string };
    };
    expect(manifest.devDependencies).toEqual({
      '@tailwindcss/vite': '4.3.2',
      tailwindcss: '4.3.2',
      vite: '8.2.0',
    });
    expect(manifest.engines.node).toBe('24.18.0');
    const lock = JSON.parse(strFromU8(entries['package-lock.json']!)) as {
      packages: Record<string, { devDependencies?: Record<string, string> }>;
    };
    expect(lock.packages['']?.devDependencies).toEqual(manifest.devDependencies);
  });

  it('不足・余分・継承したSourceを混ぜない', () => {
    expect(() => createPortableTailwindArchive({ 'index.html': files['index.html'] })).toThrow();
    expect(() => createPortableTailwindArchive({ ...files, 'progress.json': '{}' })).toThrow();
    const inherited = Object.create(files) as Record<string, string>;
    expect(() => createPortableTailwindArchive(inherited)).toThrow();
  });

  it('外部buildで解釈が変わる未対応Sourceを持ち出さない', () => {
    expect(() =>
      createPortableTailwindArchive({
        ...files,
        'styles.css': files['styles.css'] + '@config "./untrusted.js";',
      }),
    ).toThrow();
    expect(() =>
      createPortableTailwindArchive({
        ...files,
        'index.html': files['index.html'].replace('note-card', 'note-card text-red-500'),
      }),
    ).toThrow();
  });
});
