import {
  PYTHON_LESSONS,
  validPythonInputLines,
  expectedPythonOutput,
  isPythonModuleProfile,
  validPythonFiles,
  pythonSourceSnapshot,
} from '../../../core/runtime/pythonLessonProfiles.mjs';
import { z } from 'zod';
import { pythonFixedFixtures } from '../../../core/runtime/pythonFixedFixtures.mjs';
import type { SnapshotPolicy } from '../../../core/runtime/contracts';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
} from '../../../core/validation/contracts';

const factNames = [
  'numeric-variable-printed',
  'same-variable-addition-printed',
  'input-echoed',
  'age-boundary-branched',
  'range-iterated',
  'list-reference-summed',
  'dict-values-summed',
  'function-return-scoped',
  'module-imported',
  'exception-handled',
  'project-summed',
  'list-comprehension-filtered',
  'iterator-consumed',
  'generator-lifecycle',
  'context-managed-closed',
  'data-project-tested',
  'class-instance-compared',
  'methods-compared',
  'inheritance-delegation-compared',
  'property-range-validated',
  'dunder-protocols-used',
  'decorator-flow-compared',
  'wraps-metadata-preserved',
] as const;
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
    assertion: z
      .object({ kind: z.literal('python-source-fact'), fact: z.enum(factNames) })
      .strict(),
    feedback: z
      .object({ target: z.string(), expected: z.string(), nextAction: z.string() })
      .strict(),
    hintId: z.string(),
    relatedSlideId: z.string(),
  })
  .strict();

/** 固定Python教材の実出力と実AST事実をANDで採点する。指定外のengineやDOM証拠を受け入れない。 */
export class PythonLessonValidator implements ValidatorAdapter {
  /** 環境を明示し、同じRuleでも別engineの観測を流用しない。 */
  constructor(private readonly engine: 'browser-python' | 'cpython' = 'browser-python') {}

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
    const lesson = PYTHON_LESSONS[context.exerciseId];
    const base = {
      exerciseId: context.exerciseId,
      executionRevision: execution?.executionRevision ?? null,
      evaluatedAt: context.now,
      // 実行時の例外文にはinputの実値が入る。永続履歴は分類・位置と固定案内だけにする。
      diagnostics:
        execution?.status === 'code-error'
          ? context.diagnostics.map(({ code, kind, severity, file, line, column }) => {
              const message =
                kind === 'syntax'
                  ? 'Pythonの構文を確認してください。詳細は今回のConsole出力で確認できます。'
                  : 'Pythonの名前や値の使い方を確認してください。詳細は今回のConsole出力で確認できます。';
              return {
                code,
                kind,
                severity,
                ...(file === undefined ? {} : { file }),
                ...(line === undefined ? {} : { line }),
                ...(column === undefined ? {} : { column }),
                message,
                learnerMessage: message,
              };
            })
          : context.diagnostics,
    };
    const system = (): ValidationResult => ({
      ...base,
      status: 'system-error',
      checks: [],
      passedRequirementIds: [],
    });
    if (
      lesson === undefined ||
      execution === undefined ||
      execution.backend !== (this.engine === 'cpython' ? 'local' : 'browser') ||
      execution.engine !== this.engine ||
      !validPythonFiles(context.files, lesson.profile)
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
    const parsed = z.array(ruleSchema).length(lesson.facts.length).safeParse(context.rules);
    if (!parsed.success) return system();
    const rules = parsed.data;
    if (
      rules.some(
        (rule, index) =>
          rule.id !== `${context.exerciseId}-r0${String(index + 1)}` ||
          rule.assertion.fact !== lesson.facts[index],
      )
    )
      return system();
    const evidence = new Map(execution.evidence.map((item) => [item.id, item]));
    if (evidence.size !== execution.evidence.length) return system();
    const hashEvidence = evidence.get('python.source-sha256');
    if (hashEvidence?.file !== 'main.py' || typeof hashEvidence.value !== 'string') return system();
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(pythonSourceSnapshot(context.files, lesson.profile)),
    );
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (
      hashEvidence.value !== hash ||
      evidence.get('python.executed')?.value !== true ||
      typeof evidence.get('python.version')?.value !== 'string' ||
      typeof evidence.get('python.stdout')?.value !== 'string' ||
      lesson.facts.some((fact) => typeof evidence.get(`python.${fact}`)?.value !== 'boolean') ||
      context.console.length !== execution.console.length ||
      context.console.some(
        (row, index) =>
          row.text !== execution.console[index]?.text ||
          row.level !== execution.console[index].level ||
          row.sequence !== index,
      )
    )
      return system();
    let inputLines: unknown = [];
    if (lesson.profile !== 'values-vars-print-v1') {
      const input = evidence.get('python.input-lines')?.value;
      if (typeof input !== 'string') return system();
      try {
        inputLines = JSON.parse(input) as unknown;
      } catch {
        return system();
      }
      if (!validPythonInputLines(inputLines)) return system();
    }
    if (!validPythonInputLines(inputLines)) return system();
    const expected = isPythonModuleProfile(lesson.profile)
      ? evidence.get('python.expected-output')?.value
      : expectedPythonOutput(lesson.profile, inputLines);
    if (typeof expected !== 'string') return system();
    let fixedOutputCorrect = true;
    if (this.engine === 'cpython') {
      const marker = evidence.get('python.fixed-fixtures')?.value;
      if (typeof marker !== 'string') return system();
      let packet: unknown;
      try {
        packet = JSON.parse(marker) as unknown;
      } catch {
        return system();
      }
      const parsedFixture = z
        .object({
          version: z.literal(1),
          purpose: z.literal('grade'),
          profile: z.literal(lesson.profile),
          sourceHash: z.literal(hash),
          cases: z
            .array(
              z
                .object({
                  id: z.string(),
                  status: z.literal('succeeded'),
                  outputMatched: z.boolean(),
                })
                .strict(),
            )
            .min(1)
            .max(3),
        })
        .strict()
        .safeParse(packet);
      const expectedIds = pythonFixedFixtures(lesson.profile).map((fixture) => fixture.id);
      if (
        !parsedFixture.success ||
        parsedFixture.data.cases.length !== expectedIds.length ||
        parsedFixture.data.cases.some((fixture, index) => fixture.id !== expectedIds[index])
      )
        return system();
      fixedOutputCorrect = parsedFixture.data.cases.every((fixture) => fixture.outputMatched);
    }
    const outputCorrect = fixedOutputCorrect && evidence.get('python.stdout')!.value === expected;
    const observedOutput = evidence.get('python.stdout')!.value;
    const testFailed =
      lesson.profile === 'dataclass-test-project-v1' &&
      typeof observedOutput === 'string' &&
      observedOutput.split('\n').includes('Test失敗');
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
          ? '教材のコード条件と実出力を確認できました。'
          : testFailed
            ? 'Test失敗: 期待値と実際の結果を確認してください。'
            : '表示結果と教材のコード条件を確認してください。',
        expected: rule.feedback.expected,
        actual: factCorrect ? '教材のコード条件を確認済み' : '教材のコード条件は未確認',
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
