/** Restricted Markdownの許可境界とfail-closedな失敗契約を検証する。 */
import { describe, expect, it } from 'vitest';
import { parseRestrictedMarkdown, parseSlideMarkdown } from './markdown';

describe('parseSlideMarkdown', () => {
  it('Frontmatterと全種類の許可済みBlockへ分解する', () => {
    const result = parseSlideMarkdown(`---
id: slide-html-role
title: HTMLの役割
kind: concept
concept: HTML
---
## 構造
HTMLは意味を伝えます。

- 見出し
- 段落

1. 要素を選ぶ
2. 意味を確認する

\`\`\`html
<h1>こんにちは</h1>
\`\`\`

![完成例](asset:html-role-preview)

:::practice
prompt: h1を探す
expectedAction: Previewの題名を確認する
estimatedMinutes: 2
:::

:::callout
tone: tip
title: 覚え方
text: タグの役割を声に出しましょう
:::`);

    expect(result.frontmatter).toEqual({
      id: 'slide-html-role',
      title: 'HTMLの役割',
      kind: 'concept',
      concept: 'HTML',
    });
    expect(result.blocks).toEqual([
      { type: 'heading', level: 2, text: '構造' },
      { type: 'paragraph', text: 'HTMLは意味を伝えます。' },
      { type: 'list', style: 'unordered', items: ['見出し', '段落'] },
      { type: 'list', style: 'ordered', items: ['要素を選ぶ', '意味を確認する'] },
      { type: 'code', language: 'html', code: '<h1>こんにちは</h1>' },
      { type: 'image', alt: '完成例', assetId: 'html-role-preview' },
      {
        type: 'practice',
        prompt: 'h1を探す',
        expectedAction: 'Previewの題名を確認する',
        estimatedMinutes: 2,
      },
      {
        type: 'callout',
        tone: 'tip',
        title: '覚え方',
        text: 'タグの役割を声に出しましょう',
      },
    ]);
  });

  it('先頭BOMとCRLF／CRをLFと同じ結果へ正規化する', () => {
    const source = '\uFEFF---\r\nid: slide-normalized\rtitle: 正規化\r\n---\r## 見出し\r本文';

    expect(parseSlideMarkdown(source)).toEqual({
      frontmatter: { id: 'slide-normalized', title: '正規化' },
      blocks: [
        { type: 'heading', level: 2, text: '見出し' },
        { type: 'paragraph', text: '本文' },
      ],
    });
  });

  it.each([
    ['Frontmatterなし', '## 見出し', 'Frontmatterが必要'],
    ['Frontmatter未閉鎖', '---\nid: slide-a\n## 見出し', 'Frontmatterが閉じられていません'],
    ['scalar Frontmatter', '---\nslide-a\n---\n本文', 'FrontmatterはObject'],
    ['array Frontmatter', '---\n- slide-a\n---\n本文', 'FrontmatterはObject'],
    ['null Frontmatter', '---\nnull\n---\n本文', 'FrontmatterはObject'],
  ])('%sを拒否する', (_label, source, message) => {
    expect(() => parseSlideMarkdown(source)).toThrow(message);
  });

  it('Frontmatterのduplicate keyを日本語Errorへ包む', () => {
    expect(() => parseSlideMarkdown('---\nid: first\nid: second\n---\n本文')).toThrow(
      'FrontmatterのYAMLが不正です',
    );
  });

  it('Frontmatterのaliasを拒否する', () => {
    expect(() => parseSlideMarkdown('---\ntitle: &title 見出し\ncopy: *title\n---\n本文')).toThrow(
      'FrontmatterでYAML aliasは使用できません',
    );
  });

  it.each(['__proto__', 'prototype', 'constructor'])('Frontmatterの危険key %sを拒否する', (key) => {
    expect(() => parseSlideMarkdown(`---\n${key}: value\n---\n本文`)).toThrow('使用できないkey');
  });

  it.each(['<script>', '{answer}'])(
    'Frontmatterのkeyに含まれる実行可能markup %sを拒否する',
    (key) => {
      expect(() => parseSlideMarkdown(`---\n"${key}": value\n---\n本文`)).toThrow(
        /教材Markdownで使用できません/u,
      );
    },
  );

  it.each(['[公式](https://example.com)', '![図](asset:example-image)'])(
    'Frontmatterの値に含まれるlink／image %sを拒否する',
    (value) => {
      expect(() => parseSlideMarkdown(`---\ntitle: "${value}"\n---\n本文`)).toThrow(
        /image|link|画像|リンク/iu,
      );
    },
  );
});

describe('parseRestrictedMarkdown', () => {
  it('空行なしでも次のBlock開始位置でparagraphを区切る', () => {
    expect(parseRestrictedMarkdown('一行目\n二行目\n### 次\n- A\n- B')).toEqual([
      { type: 'paragraph', text: '一行目 二行目' },
      { type: 'heading', level: 3, text: '次' },
      { type: 'list', style: 'unordered', items: ['A', 'B'] },
    ]);
  });

  it('比較演算子として独立したless-than記号はparagraphに保持する', () => {
    expect(parseRestrictedMarkdown('1 < 2')).toEqual([{ type: 'paragraph', text: '1 < 2' }]);
  });

  it.each([
    '<script>alert(1)</script>',
    '前半 <strong>重要</strong> 後半',
    '</section>',
    '<!-- コメント -->',
    '<!DOCTYPE html>',
    '<section\nclass="example">',
    '<svg/onload=alert(1)>',
    '<img/src=x onerror=alert(1)>',
    '<?processing instruction?>',
    '<!ENTITY example>',
    '<![CDATA[example]]>',
  ])('Code fence外のRaw HTMLを拒否する: %s', (source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow('Raw HTMLは教材Markdownで使用できません');
  });

  it('Code fence内のHTML／JSXは表示用codeとして保持する', () => {
    expect(
      parseRestrictedMarkdown('```tsx\nexport const App = () => <main>{title}</main>;\n```'),
    ).toEqual([
      {
        type: 'code',
        language: 'tsx',
        code: 'export const App = () => <main>{title}</main>;',
      },
    ]);
  });

  it.each([
    'import Card from "./Card"',
    'export const answer = 42',
    '答えは {answer} です',
    '<Card title="例" />',
    '<>Fragment</>',
    '<foo.Bar />',
    '<$Card />',
    'import',
    'export/*comment*/ const answer = 42',
    String.raw`CSSは\{ color: red; \}です`,
  ])('Code fence外のMDXを拒否する: %s', (source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow('MDXは教材Markdownで使用できません');
  });

  it.each([
    ['未知directive', ':::quiz\nanswer: A\n:::', '未対応のdirective'],
    ['入れ子directive', ':::practice\nprompt: A\n:::callout\n:::', '入れ子'],
    [
      '未閉鎖directive',
      ':::practice\nprompt: A\nexpectedAction: B\nestimatedMinutes: 1',
      'directiveが閉じられていません',
    ],
  ])('%sを拒否する', (_label, source, message) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow(message);
  });

  it.each([
    ['未知key', ':::practice\nprompt: A\nexpectedAction: B\nestimatedMinutes: 2\nextra: C\n:::'],
    ['必須key不足', ':::practice\nprompt: A\nestimatedMinutes: 2\n:::'],
    ['空文字', ':::practice\nprompt: "  "\nexpectedAction: B\nestimatedMinutes: 2\n:::'],
    ['0分', ':::practice\nprompt: A\nexpectedAction: B\nestimatedMinutes: 0\n:::'],
    ['6分', ':::practice\nprompt: A\nexpectedAction: B\nestimatedMinutes: 6\n:::'],
    ['小数', ':::practice\nprompt: A\nexpectedAction: B\nestimatedMinutes: 1.5\n:::'],
    ['文字列minutes', ':::practice\nprompt: A\nexpectedAction: B\nestimatedMinutes: "2"\n:::'],
  ])('practiceの%sを拒否する', (_label, source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow('practiceの指定が不正です');
  });

  it('titleなしのcalloutを生成する', () => {
    expect(parseRestrictedMarkdown(':::callout\ntone: note\ntext: 大切な補足です\n:::')).toEqual([
      { type: 'callout', tone: 'note', text: '大切な補足です' },
    ]);
  });

  it.each([
    ['不正tone', ':::callout\ntone: danger\ntext: 注意\n:::'],
    ['空title', ':::callout\ntone: tip\ntitle: " "\ntext: 補足\n:::'],
    ['空text', ':::callout\ntone: warning\ntext: ""\n:::'],
    ['未知key', ':::callout\ntone: note\ntext: 補足\nextra: value\n:::'],
  ])('calloutの%sを拒否する', (_label, source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow('calloutの指定が不正です');
  });

  it('directive YAMLのduplicate keyを日本語Errorへ包む', () => {
    expect(() =>
      parseRestrictedMarkdown(':::callout\ntone: note\ntone: tip\ntext: 大切な補足です\n:::'),
    ).toThrow('calloutのYAMLが不正です');
  });

  it('directive YAMLのaliasを拒否する', () => {
    expect(() =>
      parseRestrictedMarkdown(':::callout\ntone: note\ntitle: &title 補足\ntext: *title\n:::'),
    ).toThrow('calloutでYAML aliasは使用できません');
  });

  it.each([
    ['Raw HTML', ':::callout\ntone: note\ntext: <strong>重要</strong>\n:::'],
    ['MDX', ':::practice\nprompt: "{answer}"\nexpectedAction: B\nestimatedMinutes: 1\n:::'],
  ])('directive値に含まれる%sを拒否する', (_label, source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow(/教材Markdownで使用できません/);
  });

  it('directive値に含まれるlinkを拒否する', () => {
    expect(() =>
      parseRestrictedMarkdown(':::callout\ntone: note\ntext: "[公式](https://example.com)"\n:::'),
    ).toThrow(/link|リンク/iu);
  });

  it.each([
    ['言語なしfence', '```\nconst answer = 42;\n```', '言語名が必要'],
    ['不正な言語名', '```type script\nconst answer = 42;\n```', 'Code fence'],
    ['未閉鎖fence', '```js\nconst answer = 42;', 'Code fenceが閉じられていません'],
    ['tilde fence', '~~~js\nconst answer = 42;\n~~~', '未対応のMarkdown構文'],
  ])('%sを拒否する', (_label, source, message) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow(message);
  });

  it.each([
    ['h1', '# 見出し'],
    ['h4', '#### 見出し'],
    ['空h2', '##   '],
  ])('未対応または空のheading %sを拒否する', (_label, source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow('見出し');
  });

  it.each([
    ['空list item', '- '],
    ['不正なlist継続', '- A\n- '],
    ['indented list', '  - A'],
    ['list内Raw HTML', '- <strong>A</strong>'],
    ['1以外から始まるordered list', '9. A'],
    ['連番でないordered list', '1. A\n3. B'],
    ['markerが混在するunordered list', '- A\n* B'],
  ])('%sを拒否する', (_label, source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow();
  });

  it('安全なasset imageを生成する', () => {
    expect(parseRestrictedMarkdown('![図解](asset:semantic-html-map)')).toEqual([
      { type: 'image', alt: '図解', assetId: 'semantic-html-map' },
    ]);
  });

  it.each([
    ['外部image', '![図解](https://example.com/image.png)'],
    ['相対image', '![図解](./image.png)'],
    ['不正asset ID', '![図解](asset:Semantic_HTML)'],
    ['空alt', '![](asset:semantic-html-map)'],
    ['通常link', '[詳しく読む](https://example.com)'],
    ['asset link', '[図解](asset:semantic-html-map)'],
    ['参照形式link', '[詳しく読む][reference]'],
    ['link定義', '[reference]: https://example.com'],
    ['destinationなしlink定義', '[reference]:'],
    ['email autolink', '<learner@example.com>'],
    ['scheme autolink', '<tel:+81-90-0000-0000>'],
    ['入れ子text link', '[外側 [内側]](https://example.com)'],
    ['途中改行link', '[詳しく読む](https://example.com\n"title")'],
    ['bare URL', 'https://example.com/docs'],
    ['www autolink literal', 'www.example.com/docs'],
    ['email autolink literal', 'learner@example.com'],
  ])('%sを拒否する', (_label, source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow(/image|link|画像|リンク/iu);
  });

  it.each([
    ['blockquote', '> 引用'],
    ['table', '| A | B |\n| - | - |'],
    ['horizontal rule', '---'],
    ['asterisk horizontal rule', '***'],
    ['spaced horizontal rule', '* * *'],
    ['setext heading', '見出し\n==='],
    ['outer pipeなしtable', 'A | B\n--- | ---'],
    ['plus list marker', '+ A'],
    ['parenthesis list marker', '1) A'],
    ['empty plus list marker', '+'],
    ['empty parenthesis list marker', '1)'],
    ['indented code', '    const answer = 42;'],
  ])('%sをparagraphへfallbackせず拒否する', (_label, source) => {
    expect(() => parseRestrictedMarkdown(source)).toThrow('未対応のMarkdown構文');
  });

  it.each(['', ' \n\t', '\u0000本文', '本文\u0007', '本文\u0085', '本文\uFEFF'])(
    '空本文またはcontrol文字を拒否する',
    (source) => {
      expect(() => parseRestrictedMarkdown(source)).toThrow();
    },
  );
});
