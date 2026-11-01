import { describe, expect, it } from 'vitest';
import { fixtureFeedbackRuleIds } from '../../../e2e/helpers/fixtureFeedback';

describe('fixtureの未達Requirementと個別Ruleを区別する', () => {
  it('OR成立時は個別に失敗した別解Ruleを未達にしない', () => {
    expect(
      fixtureFeedbackRuleIds(
        [
          { ruleId: 'layout-grid', passed: true, requirementPassed: true },
          { ruleId: 'layout-flex', passed: false, requirementPassed: true },
        ],
        'requirement',
      ),
    ).toEqual([]);
  });

  it('AND未達時は個別に成功したRuleも同じ未達群として返す', () => {
    expect(
      fixtureFeedbackRuleIds(
        [
          { ruleId: 'focus-visible', passed: false, requirementPassed: false },
          { ruleId: 'focus-offset', passed: true, requirementPassed: false },
          { ruleId: 'other-complete', passed: true, requirementPassed: true },
        ],
        'requirement',
      ),
    ).toEqual(['focus-offset', 'focus-visible']);
  });

  it('interaction checkpointのANDも全memberを照合し余分・欠落を許さない', () => {
    const actual = fixtureFeedbackRuleIds(
      [
        { ruleId: 'interaction:loaded:title', passed: true, requirementPassed: false },
        { ruleId: 'interaction:loaded:button', passed: false, requirementPassed: false },
        { ruleId: 'interaction:ready', passed: true, requirementPassed: true },
      ],
      'requirement',
    );
    expect(actual).toEqual(['interaction:loaded:button', 'interaction:loaded:title']);
    expect(actual).not.toEqual(['interaction:loaded:button']);
    expect(actual).not.toEqual([
      'interaction:loaded:button',
      'interaction:loaded:title',
      'unknown-rule',
    ]);
  });

  it('型付きadapterの既存Fixture契約は個別Ruleの失敗IDを完全照合する', () => {
    expect(
      fixtureFeedbackRuleIds(
        [
          { ruleId: 'checkpoint-title', passed: true, requirementPassed: false },
          { ruleId: 'checkpoint-button', passed: false, requirementPassed: false },
          { ruleId: 'other-complete', passed: true, requirementPassed: true },
        ],
        'rule',
      ),
    ).toEqual(['checkpoint-button']);
  });

  it('scope未指定や未知値を別scopeとして受理しない', () => {
    expect(() => fixtureFeedbackRuleIds([], undefined)).toThrow('scope');
    expect(() => fixtureFeedbackRuleIds([], 'either')).toThrow('scope');
  });
});
