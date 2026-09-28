import type { RunnerDiagnostic } from '../../../../core/runtime/contracts';
import type { JavaScriptExecutionPayload } from './protocol';
import { currentTargetDiagnostics } from './currentTargetGuard';
import { submitDiagnostics } from './submitGuard';

/** 初回と操作後で同じ制限・実行エラーを同じ診断へ変換する。 */
export function executionDiagnostics(
  payload: Pick<
    JavaScriptExecutionPayload,
    | 'currentTargetFailure'
    | 'submitEvidence'
    | 'budgetExhausted'
    | 'timerLimitExceeded'
    | 'runtimeError'
  >,
  scriptFile: string,
): RunnerDiagnostic[] {
  const diagnostics: RunnerDiagnostic[] = currentTargetDiagnostics(payload.currentTargetFailure);
  diagnostics.push(...submitDiagnostics(payload.submitEvidence));
  if (payload.budgetExhausted) {
    diagnostics.push({
      code: 'javascript-budget',
      kind: 'system',
      severity: 'error',
      message: 'JavaScript execution budget exhausted',
      learnerMessage:
        '処理が長く続いたため安全に停止しました。繰り返しの条件や関数の呼び出しを確認してください。',
      file: scriptFile,
    });
  }
  if (payload.timerLimitExceeded) {
    diagnostics.push({
      code: 'javascript-timer-limit',
      kind: 'system',
      severity: 'error',
      message: 'JavaScript timer limit exceeded',
      learnerMessage: '同時に動かせるtimerは10件までです。不要なtimerを減らしてください。',
      file: scriptFile,
    });
  }
  if (payload.runtimeError !== null) {
    diagnostics.push({
      code: 'javascript-runtime',
      kind: 'reference',
      severity: 'error',
      message: `${payload.runtimeError.name}: ${payload.runtimeError.message}`,
      learnerMessage:
        'JavaScriptの実行中にエラーが起きました。名前の書き間違いや対象Elementを確認してください。',
      file: scriptFile,
    });
  }
  return diagnostics;
}
