import { describe, expect, it, vi } from 'vitest';
import { ExerciseRuntimeSchema } from '../../../src/core/content/schema';
import { createTailwindSrcdoc } from '../../../src/adapters/runtime/tailwind/createTailwindSrcdoc';
import { diagnoseSyntax } from '../../../src/adapters/runtime/html-css/diagnoseSyntax';
import { TailwindRunnerAdapter } from '../../../src/adapters/runtime/tailwind/TailwindRunnerAdapter';
import type { RunnerInput } from '../../../src/core/runtime/contracts';
import { validateHtmlCssPreviewInput } from '../../../src/adapters/runtime/preview-kernel/prepareHtmlCssPreview';
import {
  restrictTailwindClasses,
  validateTailwindSource,
} from '../../../src/adapters/runtime/tailwind/validateSource';

const projectRuntime = {
  kind: 'tailwind',
  entryFile: 'index.html',
  sourceType: 'script',
  capabilityProfile: 'project',
  primaryOutput: 'preview',
  profile: 'theme-project-v1',
} as const;

const html = `<!doctype html><html lang="ja"><head>
  <title>読書メモ</title><link rel="stylesheet" href="styles.css">
</head><body><main class="flex flex-col md:flex-row gap-card">
  <section class="note-card">読む</section><section class="note-card">作る</section>
  <button type="button" class="bg-brand text-paper focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand">保存</button>
</main></body></html>`;

const css = `@import "tailwindcss";
@theme {
  --color-brand: #0f3c4c;
  --color-paper: #fffaf0;
  --spacing-card: 24px;
}
@layer components {
  .note-card { @apply p-card border border-brand bg-paper text-brand; }
}`;

/** 制作課題の原文を、既存のPreview入力境界へ渡す。 */
function projectInput(overrides: Partial<RunnerInput> = {}): RunnerInput {
  return {
    languageId: 'tailwind',
    exerciseSessionId: 'theme-project',
    executionRevision: 1,
    files: { 'index.html': html, 'styles.css': css },
    assets: [],
    viewport: { id: 'desktop', width: 800, height: 720 },
    options: { runtime: projectRuntime },
    ...overrides,
  };
}

/** 原文を変更せず、固定profileの対応範囲を確認する。 */
function validate(input: RunnerInput) {
  return validateTailwindSource(validateHtmlCssPreviewInput(input, 'tailwind'), input);
}

describe('Tailwind制作課題の固定Runtime契約', () => {
  it('制作課題だけの明示profileを受け付ける', () => {
    expect(ExerciseRuntimeSchema.safeParse(projectRuntime).success).toBe(true);
  });

  it('明示profileだけで固定2ファイルとtheme・共通classを受け付ける', () => {
    expect(validate(projectInput())).toEqual([]);
    expect(() => validate(projectInput({ options: {} }))).toThrow();
    expect(() => validate(projectInput({ files: { 'index.html': html } }))).toThrow();
  });

  it('既存の構文検査でもtheme・applyを構文エラーへ変えない', () => {
    expect(diagnoseSyntax('css', css, 'styles.css')).toEqual([]);
  });

  it('未対応CSSの診断はCSSタブへ結び、compiler取得を始めない', async () => {
    const fetchAsset = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchAsset);
    const runner = new TailwindRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    try {
      await runner.prepare(frame);
      const result = await runner.render(
        projectInput({ files: { 'index.html': html, 'styles.css': css + '@plugin "external";' } }),
      );
      expect(result.diagnostics).toMatchObject([
        { code: 'TAILWIND_INPUT_UNSUPPORTED', file: 'styles.css', severity: 'error' },
      ]);
      expect(fetchAsset).not.toHaveBeenCalled();
    } finally {
      await runner.dispose();
      frame.remove();
      vi.unstubAllGlobals();
    }
  });

  it('検証とcompiler用の制限が同じ制作classを残す', () => {
    const documentValue = new DOMParser().parseFromString(html, 'text/html');
    restrictTailwindClasses(documentValue, 'theme-project-v1');
    expect(documentValue.querySelectorAll('.note-card')).toHaveLength(2);
    expect(documentValue.querySelector('main')?.classList.contains('gap-card')).toBe(true);
    expect(
      documentValue.querySelector('button')?.classList.contains('focus-visible:outline-brand'),
    ).toBe(true);
  });

  it.each([
    css + '\n@import "https://example.com/external.css";',
    css.replace('"tailwindcss"', '"other-package"'),
    css.replace('@import', '@im\\70ort'),
    css.replace('@import', '@im/**/port'),
    css.replace('@import ', '@import\u00a0'),
    css.replace('@apply ', '@apply\u000b'),
    css.replace('#0f3c4c', 'url(https://example.com/pixel)'),
    css.replace('.note-card', 'body'),
    css.replace('.note-card', '.note\\2d card'),
    css.replace('p-card', 'p-[999999px]'),
    css.replace('p-card', 'hover:p-4'),
    css.replace('--color-paper', '--color-brand'),
    css + '\n@plugin "external-plugin";',
    css + '\n@config "./untrusted.js";',
    css + '\n@source "https://example.com/source";',
  ])('未対応CSSをcompilerへ渡す前に拒否する: %#', (unsupported) => {
    expect(() =>
      validate(projectInput({ files: { 'index.html': html, 'styles.css': unsupported } })),
    ).toThrow();
  });

  it('学習上の誤った値とコメントを受け付け、外部CSS参照は拒否する', () => {
    const incorrect = css.replace('24px', '8px').replace('p-card', 'p-2');
    expect(
      validate(projectInput({ files: { 'index.html': html, 'styles.css': incorrect } })),
    ).toEqual([]);
    expect(
      validate(
        projectInput({
          files: {
            'index.html': html,
            'styles.css': '/* 日本語のメモと @import "external"; */\n' + css,
          },
        }),
      ),
    ).toEqual([]);
    expect(() =>
      validate(
        projectInput({
          files: {
            'index.html': html.replace('href="styles.css"', 'href="https://example.com/a.css"'),
            'styles.css': css,
          },
        }),
      ),
    ).toThrow();
  });

  it('元CSSをcompiler用styleだけへ渡し、コメント内の終了タグでDOMを増やさない', () => {
    const marked = '/* </style><script>untrusted()</script> */\n' + css;
    const result = createTailwindSrcdoc(
      {
        sanitizedDocument: new DOMParser().parseFromString(html, 'text/html'),
        css: '',
        nonce: 'test-nonce',
        exerciseSessionId: 'theme-project',
        executionRevision: 1,
        viewport: { id: 'desktop', width: 800, height: 720 },
      },
      '/* 固定compilerのテスト用代替 */',
      marked,
    );
    const output = new DOMParser().parseFromString(result, 'text/html');
    const style = output.querySelector('style[type="text/tailwindcss"]');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('@theme');
    expect(output.querySelectorAll('.note-card')).toHaveLength(2);
    expect(output.querySelectorAll('script')).toHaveLength(1);
  });

  it('任意profile・別入口・未知設定を受け付けない', () => {
    for (const changed of [
      { profile: 'arbitrary-project' },
      { entryFile: 'other.html' },
      { plugins: ['external-plugin'] },
    ]) {
      expect(ExerciseRuntimeSchema.safeParse({ ...projectRuntime, ...changed }).success).toBe(
        false,
      );
    }
  });
});
