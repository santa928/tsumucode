const APPLY_UTILITIES = new Set([
  'p-card',
  'p-2',
  'p-4',
  'p-8',
  'border',
  'border-brand',
  'border-black',
  'bg-paper',
  'bg-brand',
  'bg-white',
  'bg-black',
  'text-brand',
  'text-paper',
  'text-black',
  'text-white',
  'rounded',
]);
const CSS_WHITESPACE = new Set(['\t', '\n', '\r', '\f', ' ']);

/**
 * 制作課題の3tokenと1componentだけを許可する。値の正誤は描画で判定する。
 * 外部参照・任意selector等はcompilerへ渡さず、未対応の構文ではErrorを返す。
 */
export function assertTailwindProjectCss(source: string): void {
  if (new TextEncoder().encode(source).byteLength > 4 * 1024) {
    throw new Error('この制作のstyles.cssは4 KiBまでです。');
  }
  // 空白を残し、コメントで分断されたidentifierを結合しない。
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, ' ');
  for (const character of withoutComments) {
    const code = character.charCodeAt(0);
    if (code > 0x7e || (code < 0x20 && !CSS_WHITESPACE.has(character))) {
      throw new Error(
        'styles.cssの構文は半角の文字・空白・改行で書きます。日本語のメモはコメントに書けます。',
      );
    }
  }
  const visible = withoutComments.trim();
  const blocks =
    /^@import\s+(?:"tailwindcss"|'tailwindcss')\s*;\s*@theme\s*\{([^{}]*)\}\s*@layer\s+components\s*\{\s*\.note-card\s*\{\s*@apply\s+([^;{}]+);\s*\}\s*\}$/u.exec(
      visible,
    );
  if (blocks === null) {
    throw new Error(
      'styles.cssは固定のtailwindcss取込、@theme、@layer componentsの.note-cardだけを使います。追加の取込・設定・selectorは未対応です。',
    );
  }
  const declarations = blocks[1]!
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const names = new Set<string>();
  if (declarations.length !== 3) {
    throw new Error('@themeにはcolor-brand・color-paper・spacing-cardを1個ずつ定義します。');
  }
  for (const declaration of declarations) {
    const property = /^--(color-brand|color-paper|spacing-card)\s*:\s*([\s\S]+)$/u.exec(
      declaration,
    );
    if (property === null || names.has(property[1]!)) {
      throw new Error('@themeのtoken名を確認してください。同名の重複や追加tokenは未対応です。');
    }
    const name = property[1]!;
    const value = property[2]!.trim();
    const valid =
      name === 'spacing-card'
        ? /^\d{1,2}(?:\.\d{1,2})?px$/u.test(value) && Number.parseFloat(value) <= 64
        : /^#[a-f\d]{6}$/iu.test(value);
    if (!valid) {
      throw new Error('色tokenは6桁の#hex、spacing-cardは0〜64pxの数値を使います。');
    }
    names.add(name);
  }
  const utilities = blocks[2]!.trim().split(/\s+/u);
  if (
    utilities.length > 16 ||
    new Set(utilities).size !== utilities.length ||
    !utilities.every((utility) => APPLY_UTILITIES.has(utility))
  ) {
    throw new Error('.note-cardの@applyには教材の余白・枠・色・角丸だけを使います。');
  }
}
