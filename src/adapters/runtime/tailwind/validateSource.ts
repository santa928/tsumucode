import type { RunnerDiagnostic, RunnerInput } from '../../../core/runtime/contracts';
import type { ValidatedHtmlCssPreviewInput } from '../preview-kernel/prepareHtmlCssPreview';

const TAGS = new Set([
  'html',
  'head',
  'title',
  'body',
  'main',
  'section',
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'ul',
  'li',
]);
const ATTRIBUTES = new Set(['class', 'id', 'lang', 'aria-label']);
const UTILITIES = new Set([
  'flex',
  'block',
  'inline-block',
  'flex-row',
  'flex-col',
  'gap-0',
  'gap-2',
  'gap-4',
  'gap-8',
  'p-0',
  'p-2',
  'p-4',
  'p-8',
  'border',
  'border-slate-400',
  'rounded',
  'bg-slate-100',
  'bg-white',
  'text-slate-900',
  'text-lg',
  'font-bold',
]);
const ARBITRARY = /^(?:gap|p)-\[(\d{1,3}(?:\.\d{1,2})?)(px|rem)\]$/u;
const PLAIN_CLASS = /^[a-z][a-z\d_-]*$/iu;

/** 入力の未対応とcompiler取得・実装の障害を区別する。 */
export class TailwindSourceError extends Error {}

/** 許可する数値別解は有限のgap／paddingだけ。未知classをcompilerへ流さない。 */
export function isSupportedTailwindClass(token: string): boolean {
  if (UTILITIES.has(token)) return true;
  const match = ARBITRARY.exec(token);
  if (match === null) return false;
  const value = Number(match[1]);
  return value >= 0 && value <= (match[2] === 'px' ? 128 : 8);
}

/** 対象外Sourceは未採点で保持し、安全な誤字だけをwarningと実Style判定へ進める。 */
export function validateTailwindSource(
  input: ValidatedHtmlCssPreviewInput,
  original: RunnerInput,
): readonly RunnerDiagnostic[] {
  if (input.entryFile !== 'index.html' || input.files.size !== 1 || original.assets.length !== 0) {
    throw new TailwindSourceError(
      'この実習ではindex.htmlだけを使います。追加CSS・画像・別ファイルは未対応です。',
    );
  }
  if (new TextEncoder().encode(input.htmlSource).byteLength > 16_384) {
    throw new TailwindSourceError('この実習のHTMLは16KiBまでです。編集内容は残っています。');
  }
  const documentValue = new DOMParser().parseFromString(input.htmlSource, 'text/html');
  const elements = [...documentValue.querySelectorAll('*')];
  if (elements.length > 128) throw new TailwindSourceError('この実習の要素数は128個までです。');
  let tokenCount = 0;
  const ids = new Set<string>();
  const unknown = new Set<string>();
  for (const element of elements) {
    if (!TAGS.has(element.localName)) {
      throw new TailwindSourceError(
        `${element.localName}要素はこの実習では未対応です。CSSやJavaScriptは追加しません。`,
      );
    }
    for (const attribute of element.attributes) {
      if (
        !ATTRIBUTES.has(attribute.name) ||
        attribute.value.length > 1_000 ||
        (attribute.name === 'id' && !/^[a-z][a-z\d-]{0,63}$/iu.test(attribute.value))
      ) {
        throw new TailwindSourceError(
          `${attribute.name}属性はこの実習では未対応です。classで見た目を指定します。`,
        );
      }
      if (attribute.name === 'id') {
        if (ids.has(attribute.value))
          throw new TailwindSourceError('idは1つの要素だけに付けます。');
        ids.add(attribute.value);
      }
      if (attribute.name === 'class' && ['html', 'head', 'title'].includes(element.localName)) {
        throw new TailwindSourceError(
          'この実習ではhtml・head・titleの見た目をclassで変更しません。',
        );
      }
    }
    const tokens = (element.getAttribute('class') ?? '').split(/[\t\n\f\r ]+/u).filter(Boolean);
    for (const token of tokens) {
      tokenCount += 1;
      if (tokenCount > 64 || token.length > 64)
        throw new TailwindSourceError('classは合計64個・1個64文字までです。');
      if (isSupportedTailwindClass(token)) continue;
      if (!PLAIN_CLASS.test(token)) {
        throw new TailwindSourceError(
          `${token}は未対応です。gapとpの数値px／rem以外の任意値・variantは使えません。`,
        );
      }
      unknown.add(token);
    }
  }
  return [...unknown].map((token) => ({
    code: 'TAILWIND_CLASS_UNSUPPORTED',
    kind: 'reference',
    severity: 'warning',
    message: `Unsupported Tailwind class: ${token}`,
    learnerMessage: `${token}はこの実習のUtilityにありません。見た目へ反映されないので、つづりを確認してください。`,
    file: 'index.html',
  }));
}

/** 警告済みの未知classを除外し、有限文法だけを実compilerへ渡す。 */
export function restrictTailwindClasses(documentValue: Document): void {
  for (const element of documentValue.querySelectorAll('[class]')) {
    for (const token of [...element.classList]) {
      if (!isSupportedTailwindClass(token)) element.classList.remove(token);
    }
  }
}
