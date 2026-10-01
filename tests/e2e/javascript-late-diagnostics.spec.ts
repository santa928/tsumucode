import { expect, test } from '@playwright/test';
import type { JavaScriptRunnerAdapter as Runner } from '../../src/adapters/runtime/javascript';
import { loadJavaScriptRunnerModulePath } from './helpers/javascriptRunnerModule';

const cases = [
  ['同期例外', "throw new Error('同期の失敗');", 'javascript-runtime', 'reference'],
  [
    '未捕捉の非同期例外',
    "await Promise.resolve(); throw new Error('非同期の失敗');",
    'javascript-runtime',
    'reference',
  ],
  ['遅延した予算停止', 'setTimeout(() => { while (true) {} }, 20);', 'javascript-budget', 'system'],
  [
    '遅延したタイマー上限',
    'setTimeout(() => { for (let i = 0; i < 11; i += 1) { setTimeout(() => {}, 500); } }, 20);',
    'javascript-timer-limit',
    'system',
  ],
  [
    '捕捉した拒否',
    "await Promise.reject(new Error('教材の失敗例')).catch(() => { document.querySelector('#out').textContent = '復旧'; });",
    null,
    null,
  ],
] as const;

for (const [name, body, code, kind] of cases) {
  test(`${name}を操作の再実行なしで観測し再実行後へ残さない`, async ({ page }) => {
    await page.goto('./#/');
    const runnerModulePath = await loadJavaScriptRunnerModulePath();
    const evidence = await page.evaluate(
      async ({ runnerModulePath, body }) => {
        const { JavaScriptRunnerAdapter } = (await import(/* @vite-ignore */ runnerModulePath)) as {
          JavaScriptRunnerAdapter: typeof Runner;
        };
        const runner = new JavaScriptRunnerAdapter();
        const frame = document.createElement('iframe');
        document.body.append(frame);
        await runner.prepare(frame);
        const input = {
          exerciseSessionId: 'late-diagnostics',
          executionRevision: 1,
          languageId: 'javascript',
          files: {
            'index.html':
              '<button id="go">実行</button><p id="out">待機</p><p id="count">0</p><p id="timer">待機</p>',
            'script.js': `let count = 0; document.querySelector('#go').addEventListener('click', ${body.includes('await ') ? 'async ' : ''}() => { count += 1; document.querySelector('#count').textContent = String(count); ${body} });`,
            'styles.css': '',
          },
          assets: [],
          viewport: { id: 'desktop', width: 1280, height: 720 },
          options: {
            runtime: {
              kind: 'javascript',
              entryFile: 'script.js',
              sourceType: 'script',
              capabilityProfile: 'async',
              primaryOutput: 'preview',
            },
          },
        } as const;
        const policy = {
          selectors: ['#out', '#count', '#timer'],
          attributes: [],
          computedStyles: [],
          focusVisibleSelectors: [],
          focusVisibleComputedStyles: [],
          includeAllElements: false,
        };
        try {
          const rendered = await runner.render(input);
          if (rendered.diagnostics.some((d) => d.severity === 'error'))
            throw new Error(JSON.stringify(rendered.diagnostics));
          const action = await runner.interact({
            exerciseSessionId: input.exerciseSessionId,
            executionRevision: 1,
            frameGeneration: rendered.frameGeneration!,
            requestId: 'click',
            action: { id: 'click', kind: 'click', selector: '#go' },
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
          const observed = await runner.requestSnapshot({
            exerciseSessionId: input.exerciseSessionId,
            executionRevision: 1,
            requestId: 'snapshot',
            policy,
            preserveTimers: true,
          });
          const again = await runner.requestSnapshot({
            exerciseSessionId: input.exerciseSessionId,
            executionRevision: 1,
            requestId: 'snapshot-again',
            policy,
            preserveTimers: true,
          });
          await runner.render({
            ...input,
            executionRevision: 2,
            files: {
              ...input.files,
              'script.js':
                "setTimeout(() => { document.querySelector('#timer').textContent = '完了'; console.log('完了'); }, 100);",
            },
          });
          const clean = await runner.requestSnapshot({
            exerciseSessionId: input.exerciseSessionId,
            executionRevision: 2,
            requestId: 'clean',
            policy,
            preserveTimers: true,
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
          const timer = await runner.requestSnapshot({
            exerciseSessionId: input.exerciseSessionId,
            executionRevision: 2,
            requestId: 'timer',
            policy,
            preserveTimers: true,
          });
          return { action, observed, again, clean, timer };
        } finally {
          await runner.dispose();
          frame.remove();
        }
      },
      { runnerModulePath, body },
    );
    const diagnostics = evidence.observed.runtimeObservation?.diagnostics;
    expect(diagnostics).toBeDefined();
    if (code === null) {
      expect(diagnostics).toEqual([]);
      expect(evidence.observed.nodes.find((n) => n.matchedSelectors.includes('#out'))?.text).toBe(
        '復旧',
      );
    } else {
      expect(diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code, kind, severity: 'error' })]),
      );
    }
    expect(evidence.again.runtimeObservation).toEqual(evidence.observed.runtimeObservation);
    expect(evidence.again.nodes.find((n) => n.matchedSelectors.includes('#count'))?.text).toBe('1');
    expect(evidence.clean.runtimeObservation?.diagnostics).toEqual([]);
    expect(evidence.timer.runtimeObservation?.diagnostics).toEqual([]);
    expect(evidence.timer.nodes.find((n) => n.matchedSelectors.includes('#timer'))?.text).toBe(
      '完了',
    );
    expect(evidence.timer.runtimeObservation?.console).toEqual([
      expect.objectContaining({ text: '完了' }),
    ]);
  });
}
