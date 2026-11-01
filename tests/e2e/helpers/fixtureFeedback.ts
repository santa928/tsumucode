import type { ValidationCheck } from '../../../src/core/validation/contracts';

export type FixtureFeedbackScope = 'rule' | 'requirement';

/** 既存Fixtureの期待IDの単位をdriverで宣言し、別scopeへのfallbackをしない。 */
export function fixtureFeedbackRuleIds(
  checks: readonly Pick<ValidationCheck, 'ruleId' | 'passed' | 'requirementPassed'>[],
  scope: unknown,
): string[] {
  if (scope !== 'rule' && scope !== 'requirement')
    throw new Error('Unknown fixture Feedback scope');
  return checks
    .filter((check) => !(scope === 'rule' ? check.passed : check.requirementPassed))
    .map(({ ruleId }) => ruleId)
    .sort();
}
