import { cssLanguage } from '@codemirror/lang-css';

type CssNode = ReturnType<typeof cssLanguage.parser.parse>['topNode'];
interface Declaration {
  readonly value: string;
  readonly important: boolean;
}
type Declarations = Map<string, Declaration>;

/** コメントと整形を除き、文字列・結合子・数値単位を保つ構文上の比較キーを作る。 */
function syntaxKey(node: CssNode, source: string): string {
  if (node.name === 'Comment') return '';
  if (node.name === 'NumberLiteral') {
    const unit = node.getChild('Unit');
    const number = source.slice(node.from, unit?.from ?? node.to);
    return `Number(${String(Number(number))},${unit === null ? '' : source.slice(unit.from, unit.to).toLowerCase()})`;
  }
  if (node.firstChild === null) {
    const text = source.slice(node.from, node.to);
    return JSON.stringify([
      node.name,
      node.name === 'ValueName' || node.name === 'Unit' ? text.toLowerCase() : text,
    ]);
  }
  const parts: string[] = [node.name];
  let offset = node.from;
  for (let child: CssNode | null = node.firstChild; child !== null; child = child.nextSibling) {
    parts.push(source.slice(offset, child.from).trim(), syntaxKey(child, source));
    offset = child.to;
  }
  parts.push(source.slice(offset, node.to).trim());
  return JSON.stringify(parts);
}

/** 無条件の規則だけを読み、同じセレクターの重要度と宣言順による後勝ちを適用する。 */
function readDeclarations(source: string): Map<string, Declarations> | undefined {
  const tree = cssLanguage.parser.parse(source);
  const errors: number[] = [];
  tree.iterate({
    enter(node) {
      if (node.type.isError) errors.push(node.from);
    },
  });
  if (errors.length > 0) return undefined;

  const rules = new Map<string, Declarations>();
  for (let rule = tree.topNode.firstChild; rule !== null; rule = rule.nextSibling) {
    if (rule.name !== 'RuleSet') continue;
    const block = rule.getChild('Block');
    if (block === null) continue;
    const selectors: string[] = [];
    let selector = '';
    for (
      let node = rule.firstChild;
      node !== null && node.to <= block.from;
      node = node.nextSibling
    ) {
      if (node.name === ',') {
        selectors.push(selector);
        selector = '';
      } else selector += syntaxKey(node, source);
    }
    selectors.push(selector);
    for (const key of selectors) {
      if (key === '') continue;
      const declarations = rules.get(key) ?? new Map<string, Declaration>();
      for (const node of block.getChildren('Declaration')) {
        const property = node.getChild('PropertyName');
        if (property === null) continue;
        const name = source.slice(property.from, property.to).toLowerCase();
        const important = node.getChild('Important') !== null;
        if (declarations.get(name)?.important === true && !important) continue;
        const values: string[] = [];
        for (let value = property.nextSibling; value !== null; value = value.nextSibling) {
          if (value.name !== ':' && value.name !== 'Important')
            values.push(syntaxKey(value, source));
        }
        declarations.set(name, { value: values.join(''), important });
      }
      rules.set(key, declarations);
    }
  }
  return rules;
}

/**
 * 期待する無条件CSS規則の宣言をSource内で照合する。異なるセレクターの詳細度や
 * 条件付き規則のカスケード全体は評価せず、実際の表示条件は既存Snapshot判定で確認する。
 * @param source 学習者のCSS全文。構文エラーがある場合は一致としない。
 * @param expected 単一セレクターに必要な宣言を持つ、無条件のCSS規則1件。
 * @returns 必要な値が最終宣言に揃い、期待された重要度も満たす場合だけtrue。
 */
export function containsCssDeclarations(source: string, expected: string): boolean {
  const actualRules = readDeclarations(source);
  const expectedRules = readDeclarations(expected);
  if (actualRules === undefined || expectedRules === undefined || expectedRules.size !== 1)
    return false;
  const [selector, required] = [...expectedRules][0]!;
  const actual = actualRules.get(selector);
  return (
    required.size > 0 &&
    actual !== undefined &&
    [...required].every(([name, declaration]) => {
      const value = actual.get(name);
      return value?.value === declaration.value && (!declaration.important || value.important);
    })
  );
}
