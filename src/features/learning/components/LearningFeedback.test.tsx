import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ValidationCheck, ValidationResult } from '../../../core/validation/contracts';
import { renderWithRouter } from '../../../test/renderWithRouter';
import { FeedbackPanel } from './FeedbackPanel';
import { HintPanel, type HintViewModel } from './HintPanel';
import { PreviewFrame } from './PreviewFrame';
import { previewFitScale } from './previewSizing';
import { SaveStatus } from './SaveStatus';

/** Feedback test用の未達checkを完全な公開契約で生成する。 */
function failedCheck(
  requirementId: string,
  overrides: Partial<ValidationCheck> = {},
): ValidationCheck {
  return {
    ruleId: `rule-${requirementId}`,
    requirementId,
    label: `${requirementId}を積む`,
    required: true,
    passed: false,
    requirementPassed: false,
    message: `${requirementId}がまだありません`,
    expected: `${requirementId}が1つ`,
    actual: '0個',
    nextAction: `次に${requirementId}を書きます`,
    ...overrides,
  };
}

/** status別の最小ValidationResultを生成する。 */
function result(
  status: ValidationResult['status'],
  overrides: Partial<ValidationResult> = {},
): ValidationResult {
  return {
    exerciseId: 'exercise-feedback',
    executionRevision: 1,
    status,
    checks: [],
    passedRequirementIds: [],
    diagnostics: [],
    evaluatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

const hints: readonly HintViewModel[] = [
  { id: 'hint-3', level: 3, title: '完成形との差を見る', text: 'h1の形を確認します。' },
  { id: 'hint-1', level: 1, title: '今のコードを見る', text: 'mainの中を観察します。' },
  { id: 'hint-2', level: 2, title: '置く場所を考える', text: '見出しの場所を考えます。' },
];

/** Ruleの関連Hintではなくlevel順で次の1件だけを開く実画面相当のHarness。 */
function HintOrderingHarness() {
  const [revealedHintIds, setRevealedHintIds] = useState<readonly string[]>([]);
  const revealNext = (): void => {
    const revealed = new Set(revealedHintIds);
    const next = [...hints]
      .sort((left, right) => left.level - right.level)
      .find((hint) => !revealed.has(hint.id));
    if (next !== undefined) setRevealedHintIds((current) => [...current, next.id]);
  };
  return (
    <>
      <FeedbackPanel
        result={result('incomplete', {
          checks: [failedCheck('後段Hint', { hintId: 'hint-3' })],
        })}
        onRevealNextHint={revealNext}
        onReviewSlide={vi.fn()}
      />
      <HintPanel hints={hints} revealedHintIds={revealedHintIds} onRevealNext={revealNext} />
    </>
  );
}

describe('FeedbackPanel', () => {
  it('Ruleがlevel 3 Hintを指してもlevel 1、level 2の順に1件ずつ開く', async () => {
    const { user } = renderWithRouter(<HintOrderingHarness />);

    await user.click(screen.getByRole('button', { name: '次のヒントを見る：後段Hintを積む' }));
    const hintRegion = screen.getByRole('region', { name: 'ヒント' });
    expect(hintRegion).toHaveTextContent('観察ポイント');
    expect(hintRegion).toHaveTextContent('今のコードを見る');
    expect(
      within(hintRegion).queryByText('考え方', { selector: 'summary' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ヒント2を見る：考え方' }));
    expect(within(hintRegion).getByText('考え方', { selector: 'summary' })).toBeInTheDocument();
    expect(hintRegion).toHaveTextContent('置く場所を考える');
    expect(
      within(hintRegion).queryByText('差分解説', { selector: 'summary' }),
    ).not.toBeInTheDocument();
  });

  it('初期状態では判定方法だけを案内し、未達操作を表示しない', () => {
    renderWithRouter(
      <FeedbackPanel result={undefined} onRevealNextHint={vi.fn()} onReviewSlide={vi.fn()} />,
    );

    expect(screen.getByRole('region', { name: '判定結果' })).toHaveTextContent(
      'コードを書いたら「判定する」を押してください',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('required未達をrequirement単位で最大3件に絞り、次Hintと関連Slideへ接続する', async () => {
    const onRevealNextHint = vi.fn();
    const onReviewSlide = vi.fn();
    const checks = [
      failedCheck('main', { hintId: 'hint-1', relatedSlideId: 'slide-main' }),
      failedCheck('main', { ruleId: 'rule-main-second', label: '重複main' }),
      failedCheck('heading'),
      failedCheck('paragraph'),
      failedCheck('fourth'),
      failedCheck('optional', { required: false }),
      failedCheck('already-pass', { passed: true, requirementPassed: true }),
    ];
    const { user } = renderWithRouter(
      <FeedbackPanel
        result={result('incomplete', { checks })}
        onRevealNextHint={onRevealNextHint}
        onReviewSlide={onReviewSlide}
      />,
    );

    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    expect(liveRegion).toHaveTextContent('あと一歩');
    expect(screen.queryByText('不正解')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('heading', { name: '重複main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'fourthを積む' })).not.toBeInTheDocument();

    for (const item of [
      {
        label: 'mainを積む',
        expected: 'mainが1つ',
        actual: '0個',
        nextAction: '次にmainを書きます',
      },
      {
        label: 'headingを積む',
        expected: 'headingが1つ',
        actual: '0個',
        nextAction: '次にheadingを書きます',
      },
      {
        label: 'paragraphを積む',
        expected: 'paragraphが1つ',
        actual: '0個',
        nextAction: '次にparagraphを書きます',
      },
    ] as const) {
      const listItem = screen.getByRole('heading', { name: item.label }).closest('li');
      expect(listItem).not.toBeNull();
      if (listItem === null) {
        throw new Error(`${item.label}の未達項目が見つかりません`);
      }

      const itemQueries = within(listItem);
      expect(itemQueries.getByText(item.expected)).toBeInTheDocument();
      expect(itemQueries.getByText(item.actual)).toBeInTheDocument();
      expect(itemQueries.getByText(item.nextAction)).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: '次のヒントを見る：mainを積む' }));
    expect(onRevealNextHint).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '関連スライドを見直す：mainを積む' }));
    expect(onReviewSlide).toHaveBeenCalledWith('slide-main');
  });

  it('判定結果の保存中はHintと関連Slideの操作を無効化する', () => {
    renderWithRouter(
      <FeedbackPanel
        result={result('incomplete', {
          checks: [failedCheck('main', { hintId: 'hint-1', relatedSlideId: 'slide-main' })],
        })}
        actionsDisabled
        onRevealNextHint={vi.fn()}
        onReviewSlide={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '次のヒントを見る：mainを積む' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '関連スライドを見直す：mainを積む' })).toBeDisabled();
  });

  it('同一requirementの先頭checkが合格なら、後続の最初の不合格checkを表示する', () => {
    const checks = [
      failedCheck('shared', {
        ruleId: 'rule-shared-passed',
        label: '合格済みのcheck',
        passed: true,
        requirementPassed: false,
      }),
      failedCheck('shared', {
        ruleId: 'rule-shared-failed',
        label: '未達のcheck',
      }),
    ];

    renderWithRouter(
      <FeedbackPanel
        result={result('incomplete', { checks })}
        onRevealNextHint={vi.fn()}
        onReviewSlide={vi.fn()}
      />,
    );

    expect(screen.queryByRole('heading', { name: '合格済みのcheck' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '未達のcheck' })).toBeInTheDocument();
  });

  it('code-errorはFile・行付き診断を最大3件表示し、コードへ戻す', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onResolveCodeError = vi.fn();

    try {
      renderWithRouter(
        <FeedbackPanel
          result={result('code-error', {
            diagnostics: [
              {
                code: 'HTML_SYNTAX',
                kind: 'syntax',
                severity: 'error',
                message: 'first',
                learnerMessage: 'index.htmlの2行目を確認します。',
                file: 'index.html',
                line: 2,
              },
              {
                code: 'HTML_SYNTAX',
                kind: 'syntax',
                severity: 'error',
                message: 'second',
                learnerMessage: 'index.htmlの5行目を確認します。',
                file: 'index.html',
                line: 5,
              },
              {
                code: 'CSS_SYNTAX',
                kind: 'syntax',
                severity: 'warning',
                message: 'third',
                learnerMessage: 'styles.cssの波かっこを確認します。',
                file: 'styles.css',
                line: 7,
              },
              {
                code: 'FOURTH',
                kind: 'syntax',
                severity: 'error',
                message: 'fourth',
                learnerMessage: '4件目は表示しません。',
              },
            ],
          })}
          onRevealNextHint={vi.fn()}
          onReviewSlide={vi.fn()}
          onResolveCodeError={onResolveCodeError}
        />,
      );

      expect(screen.getByRole('status')).toHaveTextContent('コードを確認しよう');
      expect(screen.queryByText('index.html:2')).not.toBeInTheDocument();
      expect(screen.queryByText('index.html:5')).not.toBeInTheDocument();
      expect(screen.getByText('styles.css:7')).toBeInTheDocument();
      expect(screen.getByText('index.htmlの2行目を確認します。')).toBeInTheDocument();
      expect(screen.getByText('index.htmlの5行目を確認します。')).toBeInTheDocument();
      expect(screen.getByText('styles.cssの波かっこを確認します。')).toBeInTheDocument();
      expect(screen.queryByText('4件目は表示しません。')).not.toBeInTheDocument();
      expect(
        consoleErrorSpy.mock.calls.some((arguments_) =>
          arguments_.some(
            (argument) => typeof argument === 'string' && argument.includes('same key'),
          ),
        ),
      ).toBe(false);
      await userEvent.click(screen.getByRole('button', { name: 'コードを直す' }));
      expect(onResolveCodeError).toHaveBeenCalledOnce();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('system-errorはSourceを保持した再実行CTAを表示する', async () => {
    const onRetrySystemError = vi.fn();
    renderWithRouter(
      <FeedbackPanel
        result={result('system-error')}
        onRevealNextHint={vi.fn()}
        onReviewSlide={vi.fn()}
        onRetrySystemError={onRetrySystemError}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'もう一度実行する' }));
    expect(onRetrySystemError).toHaveBeenCalledOnce();
  });

  it.each([
    ['pass', 'できました', '必要なピースをすべて積めました。'],
    [
      'system-error',
      'TsumuCodeで問題が起きました',
      '下書きは画面に残っています。もう一度試すか、進捗を書き出してください。',
    ],
  ] as const)('%sを学習者の責任にしない説明で通知する', (status, heading, copy) => {
    renderWithRouter(
      <FeedbackPanel result={result(status)} onRevealNextHint={vi.fn()} onReviewSlide={vi.fn()} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(heading);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('HintPanel', () => {
  it('保存済みIDが順不同でもlevelの連続prefixだけを表示し、次の1件だけを開く', async () => {
    const onRevealNext = vi.fn();
    const { rerender, user } = renderWithRouter(
      <HintPanel
        hints={hints}
        revealedHintIds={['unknown', 'hint-3']}
        onRevealNext={onRevealNext}
      />,
    );

    expect(screen.queryByText('h1の形を確認します。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ヒント1を見る：観察ポイント' }));
    expect(onRevealNext).toHaveBeenCalledOnce();

    rerender(
      <HintPanel
        hints={hints}
        revealedHintIds={['hint-3', 'hint-1']}
        onRevealNext={onRevealNext}
      />,
    );
    expect(screen.getByText('mainの中を観察します。')).toBeInTheDocument();
    expect(screen.getByText('観察ポイント')).toBeInTheDocument();
    expect(screen.queryByText('h1の形を確認します。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ヒント2を見る：考え方' })).toBeInTheDocument();
  });

  it('3段階すべてをlevel順に表示した後は完了文言だけを示す', () => {
    renderWithRouter(
      <HintPanel
        hints={hints}
        revealedHintIds={['hint-3', 'hint-1', 'hint-2']}
        onRevealNext={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('group').map(({ textContent }) => textContent)).toEqual([
      expect.stringContaining('観察ポイント'),
      expect.stringContaining('考え方'),
      expect.stringContaining('差分解説'),
    ]);
    expect(screen.getByText('3つのヒントを確認しました。')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PreviewFrame', () => {
  it('固定幅Previewが作業台より十分広いときだけ、全体表示の縮尺を返す', () => {
    expect(previewFitScale(1280, 600)).toBeCloseTo(0.46875);
    expect(previewFitScale(602, 600)).toBe(1);
    expect(previewFitScale(600, 600)).toBe(1);
    expect(previewFitScale(390, 600)).toBe(1);
  });

  it('opaque-origin sandbox属性を固定し、Strict Modeとcallback変更でも同じframeを一度だけ準備する', () => {
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <PreviewFrame onReady={firstReady} />
      </StrictMode>,
    );

    const frame = screen.getByTitle('コードのプレビュー');
    const scrollContainer = screen.getByTestId('runtime-preview-scroll');
    expect(scrollContainer).toContainElement(frame);
    expect(scrollContainer).toHaveClass('max-w-full', 'overflow-x-auto');
    expect(scrollContainer).toHaveAttribute('role', 'region');
    expect(scrollContainer).toHaveAccessibleName('コードのプレビュー表示領域');
    expect(scrollContainer).toHaveAttribute('tabindex', '0');
    expect(frame).toHaveClass('box-content', 'max-w-none');
    expect(frame).toHaveAttribute('tabindex', '-1');
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(firstReady).toHaveBeenCalledOnce();
    expect(firstReady).toHaveBeenCalledWith(frame);

    rerender(
      <StrictMode>
        <PreviewFrame onReady={secondReady} />
      </StrictMode>,
    );
    expect(firstReady).toHaveBeenCalledOnce();
    expect(secondReady).not.toHaveBeenCalled();
  });

  it('scriptless modeはReact render時点から空sandboxを固定する', () => {
    const onReady = vi.fn();
    const { rerender } = render(<PreviewFrame sandboxMode="scriptless" onReady={onReady} />);

    const frame = screen.getByTitle('コードのプレビュー');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(onReady).toHaveBeenCalledWith(frame);

    rerender(<PreviewFrame sandboxMode="scriptless" onReady={vi.fn()} />);
    expect(frame).toHaveAttribute('sandbox', '');
  });

  it('Console対象ではprimary outputを初期選択し、Arrow keyでiframeを再生成せず切り替える', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(
      <PreviewFrame
        onReady={onReady}
        consoleEnabled
        primaryOutput="console"
        consoleRecords={[{ sequence: 0, level: 'log', text: 'hello' }]}
        consoleFreshness="current"
        consoleUpdateSequence={1}
      />,
    );

    const consoleTab = screen.getByRole('tab', { name: 'Console' });
    const previewTab = screen.getByRole('tab', { name: '画面' });
    const frame = screen.getByTitle('コードのプレビュー');
    expect(consoleTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Console' })).toBeVisible();
    expect(frame).toBeInTheDocument();

    consoleTab.focus();
    await user.keyboard('{ArrowLeft}');
    expect(previewTab).toHaveFocus();
    expect(previewTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '画面' })).toBeVisible();
    expect(screen.getByTitle('コードのプレビュー')).toBe(frame);
    expect(onReady).toHaveBeenCalledOnce();

    await user.keyboard('{End}');
    expect(consoleTab).toHaveFocus();
    expect(consoleTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(previewTab).toHaveFocus();
    expect(previewTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(consoleTab).toHaveFocus();
    expect(consoleTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(consoleTab).toHaveFocus();
    expect(consoleTab).toHaveAttribute('aria-selected', 'true');
  });

  it('画面Tabの表示中もConsole更新を読み上げ、同じ件数の再実行を区別する', () => {
    const { rerender } = render(
      <PreviewFrame
        onReady={vi.fn()}
        consoleEnabled
        primaryOutput="preview"
        consoleRecords={[{ sequence: 0, level: 'log', text: 'first' }]}
        consoleFreshness="current"
        consoleUpdateSequence={1}
      />,
    );

    const liveRegion = screen.getByRole('status', { name: 'Consoleの更新' });
    expect(screen.getByRole('tabpanel', { name: '画面' })).toBeVisible();
    expect(liveRegion).toBeVisible();
    expect(liveRegion).toHaveTextContent('Consoleを更新しました。1件。1回目の実行結果です');

    rerender(
      <PreviewFrame
        onReady={vi.fn()}
        consoleEnabled
        primaryOutput="preview"
        consoleRecords={[{ sequence: 0, level: 'log', text: 'second' }]}
        consoleFreshness="current"
        consoleUpdateSequence={2}
      />,
    );
    expect(liveRegion).toHaveTextContent('Consoleを更新しました。1件。2回目の実行結果です');
  });

  it('Console非対象ではtablistを出さず既存Preview headingとiframeを維持する', () => {
    render(<PreviewFrame onReady={vi.fn()} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'プレビュー' })).toBeVisible();
    expect(screen.getByTitle('コードのプレビュー')).toBeVisible();
  });
});

describe('SaveStatus', () => {
  it.each([
    ['idle', 'status', '自動保存オン'],
    ['saving', 'status', '保存中'],
    ['saved', 'status', '保存済み'],
    ['error', 'alert', '保存できません。編集内容は画面に残っています'],
  ] as const)('%sをTextと適切なlive roleで伝える', (status, role, label) => {
    render(<SaveStatus status={status} />);
    const liveRegion = screen.getByRole(role);
    expect(liveRegion).toHaveTextContent(label);
    expect(liveRegion).toHaveAttribute('aria-live', status === 'error' ? 'assertive' : 'polite');
  });
});
