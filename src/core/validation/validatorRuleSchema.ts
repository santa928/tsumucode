import type { HtmlCssValidationRuleDefinition } from '../content/types';
import type { SnapshotPolicy } from '../runtime/contracts';
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';

const MAX_SELECTORS = 64;
const MAX_ATTRIBUTES = 64;
const MAX_COMPUTED_STYLES = 128;

const ASSERTION_KINDS = new Set([
  'accessible-name',
  'attribute',
  'computed-style',
  'contrast',
  'count',
  'exists',
  'focus-visible-style',
  'focusable',
  'overflow-x',
  'rect',
  'relation',
  'role',
  'text',
]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RULE_REQUIRED_KEYS = [
  'assertion',
  'feedback',
  'group',
  'hintId',
  'id',
  'label',
  'relatedSlideId',
  'required',
  'target',
  'viewportIds',
  'viewportMode',
] as const;

/** unknownを配列でないrecordへ限定する。 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 空白だけでない文字列か判定する。 */
function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Recordが必須fieldをすべて持ち、許可field以外を含まないか判定する。 */
function hasContractKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) && actual.every((key) => allowed.has(key))
  );
}

/** 数値がJSONで表現可能な有限値か判定する。 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 公開相対Pathとして同一Origin境界を越えないか判定する。 */
function isSafeRelativePath(value: unknown): value is string {
  if (!isNonEmptyText(value)) return false;
  try {
    resolvePublicAsset('/', value);
    return true;
  } catch {
    return false;
  }
}

/** HTML/CSS Rule targetをkind別のstrict契約で検証する。 */
function assertRuleTarget(value: Readonly<Record<string, unknown>>): void {
  if (value.kind === 'selector') {
    if (!hasContractKeys(value, ['kind', 'selector']) || !isNonEmptyText(value.selector)) {
      throw new Error('Validator rule selector targetが契約に一致しません');
    }
    return;
  }
  if (value.kind === 'source') {
    if (!hasContractKeys(value, ['file', 'kind']) || !isSafeRelativePath(value.file)) {
      throw new Error('Validator rule source targetが契約に一致しません');
    }
    return;
  }
  if (value.kind === 'node') {
    if (
      !hasContractKeys(value, ['kind'], ['role', 'tagName', 'textIncludes']) ||
      ![value.tagName, value.role, value.textIncludes].some(isNonEmptyText) ||
      [value.tagName, value.role, value.textIncludes].some(
        (part) => part !== undefined && !isNonEmptyText(part),
      )
    ) {
      throw new Error('Validator rule node targetが契約に一致しません');
    }
    return;
  }
  throw new Error('Validator rule target kindが契約に一致しません');
}

/** HTML/CSS assertionをdiscriminantとoperatorごとのstrict契約で検証する。 */
function assertRuleAssertion(value: Readonly<Record<string, unknown>>): void {
  if (!isNonEmptyText(value.kind) || !ASSERTION_KINDS.has(value.kind)) {
    throw new Error('Validator rule assertion kindが契約に一致しません');
  }
  const exact = (required: readonly string[], optional: readonly string[] = []): boolean =>
    hasContractKeys(value, required, optional);
  const numberWithTolerance = (): boolean =>
    isFiniteNumber(value.expected) &&
    (value.tolerance === undefined || (isFiniteNumber(value.tolerance) && value.tolerance >= 0));

  switch (value.kind) {
    case 'exists':
      if (exact(['kind'])) return;
      break;
    case 'count':
      if (
        exact(['expected', 'kind', 'operator']) &&
        ['equals', 'gte', 'lte'].includes(String(value.operator)) &&
        Number.isInteger(value.expected) &&
        Number(value.expected) >= 0
      )
        return;
      break;
    case 'attribute':
      if (!isNonEmptyText(value.name)) break;
      if (value.operator === 'present' && exact(['kind', 'name', 'operator'])) return;
      if (
        value.operator === 'equals' &&
        exact(['expected', 'kind', 'name', 'operator']) &&
        (typeof value.expected === 'string' ||
          typeof value.expected === 'boolean' ||
          isFiniteNumber(value.expected))
      )
        return;
      if (
        value.operator === 'contains' &&
        exact(['expected', 'kind', 'name', 'operator']) &&
        isNonEmptyText(value.expected)
      )
        return;
      if (
        (value.operator === 'gte' || value.operator === 'lte') &&
        exact(['expected', 'kind', 'name', 'operator']) &&
        isFiniteNumber(value.expected)
      )
        return;
      break;
    case 'text':
      if (
        value.operator === 'equals' &&
        exact(['expected', 'kind', 'operator']) &&
        typeof value.expected === 'string'
      )
        return;
      if (
        (value.operator === 'contains' || value.operator === 'contains-normalized') &&
        exact(['expected', 'kind', 'operator']) &&
        isNonEmptyText(value.expected)
      )
        return;
      break;
    case 'computed-style':
    case 'focus-visible-style':
      if (!isNonEmptyText(value.property)) break;
      if (
        value.operator === 'equals' &&
        exact(['expected', 'kind', 'operator', 'property'], ['tolerance']) &&
        (typeof value.expected === 'string' ? value.tolerance === undefined : numberWithTolerance())
      )
        return;
      if (
        value.operator === 'contains' &&
        exact(['expected', 'kind', 'operator', 'property']) &&
        isNonEmptyText(value.expected)
      )
        return;
      if (
        (value.operator === 'gte' || value.operator === 'lte') &&
        exact(['expected', 'kind', 'operator', 'property'], ['tolerance']) &&
        numberWithTolerance()
      )
        return;
      break;
    case 'rect':
      if (
        exact(['expected', 'kind', 'metric', 'operator'], ['tolerance']) &&
        ['x', 'y', 'width', 'height'].includes(String(value.metric)) &&
        ['equals', 'gte', 'lte'].includes(String(value.operator)) &&
        numberWithTolerance()
      )
        return;
      break;
    case 'overflow-x':
    case 'focusable':
      if (
        exact(['expected', 'kind', 'operator']) &&
        value.operator === 'equals' &&
        typeof value.expected === 'boolean'
      )
        return;
      break;
    case 'accessible-name':
      if (value.operator === 'present' && exact(['kind', 'operator'])) return;
      if (
        (value.operator === 'equals' || value.operator === 'contains') &&
        exact(['expected', 'kind', 'operator']) &&
        isNonEmptyText(value.expected)
      )
        return;
      break;
    case 'role':
      if (value.operator === 'present' && exact(['kind', 'operator'])) return;
      if (
        value.operator === 'equals' &&
        exact(['expected', 'kind', 'operator']) &&
        isNonEmptyText(value.expected)
      )
        return;
      break;
    case 'relation':
      if (
        exact(['kind', 'otherSelector', 'relation']) &&
        ['child', 'descendant', 'next-sibling', 'before', 'contained-by'].includes(
          String(value.relation),
        ) &&
        isNonEmptyText(value.otherSelector)
      )
        return;
      break;
    case 'contrast':
      if (
        exact(['kind', 'minimum']) &&
        isFiniteNumber(value.minimum) &&
        value.minimum >= 1 &&
        value.minimum <= 21
      )
        return;
      break;
  }
  throw new Error('Validator rule assertionが契約に一致しません');
}

/** Compiler検証済みRuleをEvaluatorが安全に読むための最小envelopeへ限定する。 */
function parseRuleEnvelope(value: unknown): HtmlCssValidationRuleDefinition {
  if (!isRecord(value)) throw new Error('Validator ruleはObjectで指定してください');
  const target = value.target;
  const assertion = value.assertion;
  const feedback = value.feedback;
  if (
    !hasContractKeys(value, RULE_REQUIRED_KEYS, ['groupId']) ||
    !isNonEmptyText(value.id) ||
    !ID_PATTERN.test(value.id) ||
    !isNonEmptyText(value.label) ||
    typeof value.required !== 'boolean' ||
    (value.group !== 'all' && value.group !== 'any') ||
    (value.groupId !== undefined &&
      (!isNonEmptyText(value.groupId) || !ID_PATTERN.test(value.groupId))) ||
    (value.viewportMode !== 'all' && value.viewportMode !== 'any') ||
    !Array.isArray(value.viewportIds) ||
    value.viewportIds.length === 0 ||
    !value.viewportIds.every((id) => isNonEmptyText(id) && ID_PATTERN.test(id)) ||
    !isRecord(feedback) ||
    !hasContractKeys(feedback, ['expected', 'nextAction', 'target']) ||
    !isNonEmptyText(feedback.target) ||
    !isNonEmptyText(feedback.expected) ||
    !isNonEmptyText(feedback.nextAction) ||
    !isNonEmptyText(value.hintId) ||
    !ID_PATTERN.test(value.hintId) ||
    !isNonEmptyText(value.relatedSlideId) ||
    !ID_PATTERN.test(value.relatedSlideId) ||
    !isRecord(target) ||
    !isRecord(assertion) ||
    !isNonEmptyText(assertion.kind)
  ) {
    throw new Error('Validator ruleの必須fieldが契約に一致しません');
  }
  assertRuleTarget(target);
  assertRuleAssertion(assertion);
  if (target.kind === 'source' && assertion.kind !== 'text') {
    throw new Error('source targetはtext assertionだけ使用できます');
  }
  if (assertion.kind === 'focus-visible-style' && target.kind !== 'selector') {
    throw new Error('focus-visible-style assertionはselector targetだけ使用できます');
  }
  if (
    assertion.kind === 'text' &&
    assertion.operator === 'contains-normalized' &&
    target.kind !== 'source'
  ) {
    throw new Error('contains-normalizedはsource targetだけ使用できます');
  }
  return structuredClone(value) as HtmlCssValidationRuleDefinition;
}

/** 信頼境界を越えたRule集合をHTML/CSS用data-only契約へ変換する。 */
export function parseValidatorRules(input: unknown): readonly HtmlCssValidationRuleDefinition[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Validator ruleを1件以上指定してください');
  }
  const rules = input.map(parseRuleEnvelope);
  const ruleIds = new Set<string>();
  const requirements = new Map<
    string,
    { readonly group: 'all' | 'any'; readonly required: boolean }
  >();
  for (const rule of rules) {
    if (ruleIds.has(rule.id)) throw new Error(`Rule IDが重複しています: ${rule.id}`);
    ruleIds.add(rule.id);
    const requirementId = rule.groupId ?? rule.id;
    const requirement = requirements.get(requirementId);
    if (requirement === undefined) {
      requirements.set(requirementId, { group: rule.group, required: rule.required });
    } else if (requirement.group !== rule.group) {
      throw new Error(`Requirement ${requirementId} のgroupが一致しません`);
    } else if (requirement.required !== rule.required) {
      throw new Error(`Requirement ${requirementId} のrequiredが一致しません`);
    }
  }
  return rules;
}

/** 上限超過をPreview Bridgeへ送る前に決定的なErrorへ変換する。 */
function assertPolicyCapacity(label: string, values: ReadonlySet<string>, limit: number): void {
  if (values.size > limit) {
    throw new Error(
      `Snapshot policy ${label} exceeds limit ${String(limit)}: ${String(values.size)}`,
    );
  }
}

/** Bridgeへ渡す観測fieldをRuleから最小集合として純粋に導出する。 */
export function buildSnapshotPolicy(
  rules: readonly HtmlCssValidationRuleDefinition[],
): SnapshotPolicy {
  const selectors = new Set<string>();
  const attributes = new Set<string>();
  const computedStyles = new Set<string>();
  const focusVisibleSelectors = new Set<string>();
  const focusVisibleComputedStyles = new Set<string>();
  let includeAllElements = false;

  for (const rule of rules) {
    if (rule.target.kind === 'selector') selectors.add(rule.target.selector);
    else if (rule.target.kind === 'node') includeAllElements = true;

    switch (rule.assertion.kind) {
      case 'relation':
        selectors.add(rule.assertion.otherSelector);
        if (rule.assertion.relation === 'next-sibling') includeAllElements = true;
        break;
      case 'attribute':
        attributes.add(rule.assertion.name);
        break;
      case 'computed-style':
        computedStyles.add(rule.assertion.property);
        break;
      case 'focus-visible-style':
        if (rule.target.kind === 'selector') focusVisibleSelectors.add(rule.target.selector);
        focusVisibleComputedStyles.add(rule.assertion.property);
        break;
      case 'contrast':
        computedStyles.add('color');
        computedStyles.add('background-color');
        computedStyles.add('background-image');
        break;
      default:
        break;
    }
  }

  assertPolicyCapacity('selector', selectors, MAX_SELECTORS);
  assertPolicyCapacity('attribute', attributes, MAX_ATTRIBUTES);
  assertPolicyCapacity('computed style', computedStyles, MAX_COMPUTED_STYLES);
  assertPolicyCapacity('focus-visible selector', focusVisibleSelectors, MAX_SELECTORS);
  assertPolicyCapacity(
    'focus-visible computed style',
    focusVisibleComputedStyles,
    MAX_COMPUTED_STYLES,
  );

  return {
    selectors: [...selectors].sort(),
    attributes: [...attributes].sort(),
    computedStyles: [...computedStyles].sort(),
    focusVisibleSelectors: [...focusVisibleSelectors].sort(),
    focusVisibleComputedStyles: [...focusVisibleComputedStyles].sort(),
    includeAllElements,
  };
}
