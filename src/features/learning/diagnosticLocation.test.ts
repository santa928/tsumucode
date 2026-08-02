import { describe, expect, it } from 'vitest';
import type { RunnerDiagnostic } from '../../core/runtime/contracts';
import { diagnosticLocation, supplementalDiagnosticLocation } from './diagnosticLocation';

/** テストごとの差分だけを受け取り、位置情報付きの学習者向け診断を作る。 */
function diagnostic(overrides: Partial<RunnerDiagnostic> = {}): RunnerDiagnostic {
  return {
    code: 'syntax-error',
    kind: 'syntax',
    severity: 'error',
    message: 'Unexpected token',
    learnerMessage: 'コードの書き方を確認してください。',
    file: 'main.js',
    line: 3,
    column: 5,
    ...overrides,
  };
}

describe('diagnosticLocation', () => {
  it('File・行・列をエディター向けの短い位置へ整形する', () => {
    expect(diagnosticLocation(diagnostic())).toBe('main.js:3:5');
  });

  it('学習者向け文に同じFileと行がある場合は重複する補助位置を返さない', () => {
    expect(
      supplementalDiagnosticLocation(
        diagnostic({
          file: 'styles.css',
          line: 1,
          column: 1,
          learnerMessage: 'styles.cssの1行目1文字目付近を確認してください。',
        }),
      ),
    ).toBeUndefined();
  });

  it('学習者向け文に位置がなければコードへ戻れる補助位置を返す', () => {
    expect(supplementalDiagnosticLocation(diagnostic())).toBe('main.js:3:5');
  });
});
