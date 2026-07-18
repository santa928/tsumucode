import { z } from 'zod';
import { HtmlCssValidationRuleDefinitionSchema } from '../content/schema';
import type { HtmlCssValidationRuleDefinition } from '../content/types';
import type { SnapshotPolicy } from '../runtime/contracts';

const MAX_SELECTORS = 64;
const MAX_ATTRIBUTES = 64;
const MAX_COMPUTED_STYLES = 128;

const ValidatorRulesSchema = z
  .array(HtmlCssValidationRuleDefinitionSchema)
  .min(1)
  .superRefine((rules, context) => {
    const ruleIds = new Set<string>();
    const requirements = new Map<
      string,
      { readonly group: 'all' | 'any'; readonly required: boolean }
    >();

    rules.forEach((rule, index) => {
      if (ruleIds.has(rule.id)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `Rule IDが重複しています: ${rule.id}`,
        });
      }
      ruleIds.add(rule.id);

      const requirementId = rule.groupId ?? rule.id;
      const requirement = requirements.get(requirementId);
      if (requirement === undefined) {
        requirements.set(requirementId, { group: rule.group, required: rule.required });
        return;
      }
      if (requirement.group !== rule.group) {
        context.addIssue({
          code: 'custom',
          path: [index, 'group'],
          message: `Requirement ${requirementId} のgroupが一致しません`,
        });
      }
      if (requirement.required !== rule.required) {
        context.addIssue({
          code: 'custom',
          path: [index, 'required'],
          message: `Requirement ${requirementId} のrequiredが一致しません`,
        });
      }
    });
  });

/** 信頼境界を越えたRule集合をHTML/CSS用data-only契約へ変換する。 */
export function parseValidatorRules(input: unknown): readonly HtmlCssValidationRuleDefinition[] {
  return ValidatorRulesSchema.parse(input);
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
  let includeAllElements = false;

  for (const rule of rules) {
    if (rule.target.kind === 'selector') selectors.add(rule.target.selector);
    else includeAllElements = true;

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

  return {
    selectors: [...selectors].sort(),
    attributes: [...attributes].sort(),
    computedStyles: [...computedStyles].sort(),
    includeAllElements,
  };
}
