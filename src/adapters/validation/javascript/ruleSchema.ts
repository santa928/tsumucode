import {
  HtmlCssValidationRuleDefinitionSchema,
  JavaScriptValidationRuleDefinitionSchema,
} from '../../../core/content/schema';
import type {
  HtmlCssValidationRuleDefinition,
  JavaScriptValidationRuleDefinition,
} from '../../../core/content/types';
import type { SnapshotPolicy } from '../../../core/runtime/contracts';
import { buildSnapshotPolicy as buildHtmlCssSnapshotPolicy } from '../../../core/validation/validatorRuleSchema';

export type JavaScriptValidatorRule =
  HtmlCssValidationRuleDefinition | JavaScriptValidationRuleDefinition;

/** unknown値を配列ではないRecordへ絞り込む。 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JavaScript固有targetまたはassertionを使うRuleかを判定する。 */
function usesJavaScriptContract(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const target = value.target;
  const assertion = value.assertion;
  return (
    (isRecord(target) &&
      (target.kind === 'javascript-source' || target.kind === 'javascript-console')) ||
    (isRecord(assertion) &&
      (assertion.kind === 'query-selector-text-content-assignment' ||
        assertion.kind === 'javascript-source-fact' ||
        assertion.kind === 'javascript-console'))
  );
}

/** 単一RuleをJavaScript専用または既存DOMのstrict契約へ変換する。 */
export function parseJavaScriptRule(value: unknown): JavaScriptValidatorRule {
  return usesJavaScriptContract(value)
    ? JavaScriptValidationRuleDefinitionSchema.parse(value)
    : HtmlCssValidationRuleDefinitionSchema.parse(value);
}

/** JavaScript Validator用Rule集合を重複・group整合までfail-closedに検証する。 */
export function parseJavaScriptRules(input: unknown): readonly JavaScriptValidatorRule[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('JavaScript Validator ruleを1件以上指定してください');
  }
  const rules = input.map(parseJavaScriptRule);
  const ids = new Set<string>();
  const requirements = new Map<
    string,
    { readonly group: 'all' | 'any'; readonly required: boolean }
  >();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`JavaScript Rule IDが重複しています: ${rule.id}`);
    ids.add(rule.id);
    if (new Set(rule.viewportIds).size !== rule.viewportIds.length) {
      throw new Error(`JavaScript Rule viewport IDが重複しています: ${rule.id}`);
    }
    const requirementId = rule.groupId ?? rule.id;
    const known = requirements.get(requirementId);
    if (known === undefined) {
      requirements.set(requirementId, { group: rule.group, required: rule.required });
    } else if (known.group !== rule.group) {
      throw new Error(`Requirement ${requirementId} のgroupが一致しません`);
    } else if (known.required !== rule.required) {
      throw new Error(`Requirement ${requirementId} のrequiredが一致しません`);
    }
  }
  if (!rules.some((rule) => rule.target.kind === 'javascript-source')) {
    throw new Error('JavaScript Validator ruleにはSource Ruleが1件以上必要です');
  }
  return Object.freeze(rules);
}

/** JavaScript Source Ruleを除外し、DOM Ruleだけから最小Snapshot policyを導出する。 */
export function buildJavaScriptSnapshotPolicy(
  rules: readonly JavaScriptValidatorRule[],
): SnapshotPolicy {
  const domRules = rules.filter(
    (rule): rule is HtmlCssValidationRuleDefinition =>
      rule.target.kind !== 'javascript-source' && rule.target.kind !== 'javascript-console',
  );
  return buildHtmlCssSnapshotPolicy(domRules);
}
