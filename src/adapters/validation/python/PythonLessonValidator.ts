import { z } from 'zod';
import type { SnapshotPolicy } from '../../../core/runtime/contracts';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
} from '../../../core/validation/contracts';

const EXERCISE_ID = 'python-basics-ch01-l01-e01';
const facts = ['numeric-variable-printed', 'same-variable-addition-printed'] as const;
const ruleSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    required: z.literal(true),
    group: z.literal('all'),
    groupId: z.undefined().optional(),
    viewportMode: z.literal('all'),
    viewportIds: z.array(z.string()).min(1),
    target: z.object({ kind: z.literal('python-source'), file: z.literal('main.py') }).strict(),
    assertion: z.object({ kind: z.literal('python-source-fact'), fact: z.enum(facts) }).strict(),
    feedback: z
      .object({ target: z.string(), expected: z.string(), nextAction: z.string() })
      .strict(),
    hintId: z.string(),
    relatedSlideId: z.string(),
  })
  .strict();

/** 最小1演習の実出力と実AST事実をANDで採点する。DOMや別engineの証拠を受け入れない。 */
export class PythonLessonValidator implements ValidatorAdapter {
  /** Consoleだけの演習はviewportやDOM snapshotを要求しない。 */
  buildSnapshotPolicy(): SnapshotPolicy {
    return {
      selectors: [],
      attributes: [],
      computedStyles: [],
      focusVisibleSelectors: [],
      focusVisibleComputedStyles: [],
      includeAllElements: false,
    };
  }

  /** 元source hash・identity・stdoutとboolean factsを照合し、環境障害を未達と混ぜない。 */
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const execution = context.execution;
    const base = {
      exerciseId: context.exerciseId,
      executionRevision: execution?.executionRevision ?? null,
      evaluatedAt: context.now,
      diagnostics: context.diagnostics,
    };
    const system = (): ValidationResult => ({
      ...base,
      status: 'system-error',
      checks: [],
      passedRequirementIds: [],
    });
    if (
      context.exerciseId !== EXERCISE_ID ||
      execution === undefined ||
      execution.backend !== 'browser' ||
      execution.engine !== 'browser-python' ||
      Object.keys(context.files).length !== 1 ||
      typeof context.files['main.py'] !== 'string'
    )
      return system();
    if (execution.status === 'code-error')
      return {
        ...base,
        status: 'code-error',
        checks: [],
        passedRequirementIds: [],
      };
    if (execution.status !== 'succeeded') return system();
    const parsed = z.array(ruleSchema).length(2).safeParse(context.rules);
    if (!parsed.success) return system();
    const rules = parsed.data;
    if (
      rules.some(
        (rule, index) =>
          rule.id !== `${EXERCISE_ID}-r0${String(index + 1)}` ||
          rule.assertion.fact !== facts[index],
      )
    )
      return system();
    const evidence = new Map(execution.evidence.map((item) => [item.id, item]));
    if (evidence.size !== execution.evidence.length) return system();
    const hashEvidence = evidence.get('python.source-sha256');
    if (hashEvidence?.file !== 'main.py' || typeof hashEvidence.value !== 'string') return system();
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(context.files['main.py']),
    );
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (
      hashEvidence.value !== hash ||
      evidence.get('python.executed')?.value !== true ||
      typeof evidence.get('python.version')?.value !== 'string' ||
      typeof evidence.get('python.stdout')?.value !== 'string' ||
      facts.some((fact) => typeof evidence.get(`python.${fact}`)?.value !== 'boolean') ||
      context.console.length !== execution.console.length ||
      context.console.some(
        (row, index) =>
          row.text !== execution.console[index]?.text ||
          row.level !== execution.console[index].level ||
          row.sequence !== index,
      )
    )
      return system();
    const outputCorrect = evidence.get('python.stdout')!.value === '3\n5\n';
    const checks = rules.map((rule) => {
      const factCorrect = evidence.get(`python.${rule.assertion.fact}`)!.value === true;
      const passed = outputCorrect && factCorrect;
      return {
        ruleId: rule.id,
        requirementId: rule.id,
        label: rule.label,
        required: true,
        passed,
        requirementPassed: passed,
        message: passed
          ? '変数を使った表示と実出力を確認できました。'
          : '表示結果と変数の使い方を確認してください。',
        expected: rule.feedback.expected,
        actual: factCorrect ? '変数の使い方を確認済み' : 'この変数の使い方は未確認',
        nextAction: passed ? '' : rule.feedback.nextAction,
        hintId: rule.hintId,
        relatedSlideId: rule.relatedSlideId,
      };
    });
    return {
      ...base,
      status: checks.every((check) => check.passed) ? 'pass' : 'incomplete',
      checks,
      passedRequirementIds: checks
        .filter((check) => check.passed)
        .map((check) => check.requirementId),
    };
  }
}
