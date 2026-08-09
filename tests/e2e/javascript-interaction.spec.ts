import { expect, test } from '@playwright/test';
import type { JavaScriptRunnerAdapter as JavaScriptRunnerAdapterType } from '../../src/adapters/runtime/javascript';
import type { JavaScriptInteractionAction, PreviewViewport } from '../../src/core/content/types';
import type {
  PreviewSnapshot,
  RunnerConsoleRecord,
  SnapshotPolicy,
} from '../../src/core/runtime/contracts';
import { loadJavaScriptRunnerModulePath } from './helpers/javascriptRunnerModule';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';

const HTML = `<!doctype html>
<html lang="ja">
  <body>
    <main>
      <p id="question">問題1</p>
      <p id="score">0点</p>
      <button id="answer" type="button">正解を選ぶ</button>
      <p id="result" hidden>2問正解</p>
      <button id="retry" type="button">再挑戦</button>
      <label>名前 <input id="name" /></label>
      <p id="input-status">未入力</p>
      <label>分類
        <select id="category">
          <option value="html">HTML</option>
          <option value="css">CSS</option>
        </select>
      </label>
      <p id="category-status">HTML</p>
      <button id="key-target" type="button">キーを試す</button>
      <p id="key-status">未操作</p>
      <button id="next" type="button">次へ</button>
    </main>
  </body>
</html>`;

const SOURCE = `let score = 0;
let question = 1;
const scoreNode = document.querySelector('#score');
const questionNode = document.querySelector('#question');
const resultNode = document.querySelector('#result');
document.querySelector('#answer').addEventListener('click', () => {
  score += 1;
  question += 1;
  scoreNode.textContent = score + '点';
  questionNode.textContent = question <= 2 ? '問題' + question : '完了';
  if (score === 2) resultNode.hidden = false;
  console.log('answer:' + score);
});
document.querySelector('#retry').addEventListener('click', () => {
  score = 0;
  question = 1;
  scoreNode.textContent = '0点';
  questionNode.textContent = '問題1';
  resultNode.hidden = true;
  console.log('retry');
});
const nameInput = document.querySelector('#name');
nameInput.addEventListener('input', () => {
  document.querySelector('#input-status').textContent = nameInput.value;
  console.log('fill:' + nameInput.value);
});
const categorySelect = document.querySelector('#category');
categorySelect.addEventListener('change', () => {
  document.querySelector('#category-status').textContent = categorySelect.value.toUpperCase();
  console.log('select:' + categorySelect.value);
});
document.querySelector('#key-target').addEventListener('keydown', (event) => {
  document.querySelector('#key-status').textContent = event.key;
  console.log('key:' + event.key);
});`;

interface InteractionBrowserEvidence {
  readonly generations: readonly number[];
  readonly answer: {
    readonly scoreAfterFirst: string;
    readonly questionAfterFirst: string;
    readonly scoreAfterSecond: string;
    readonly resultHiddenAfterSecond: boolean;
    readonly console: readonly string[];
  };
  readonly retry: {
    readonly initialScore: string;
    readonly finalScore: string;
    readonly finalQuestion: string;
    readonly resultHidden: boolean;
  };
  readonly form: {
    readonly input: string;
    readonly category: string;
    readonly enter: string;
    readonly arrow: string;
    readonly nextFocused: boolean;
    readonly console: readonly string[];
  };
  readonly parentFocusPreserved: boolean;
}

test.beforeEach(async ({ page }) => {
  await observeRuntimePage(page);
  await page.goto('./#/');
});

test.afterEach(async ({ page }) => {
  await expect(readRuntimeErrors(page)).resolves.toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});

test('5 actionを実利用順で実行し、Scenarioごとにstate・Console・Focusを分離する', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.test')) externalRequests.push(request.url());
  });
  const runnerModulePath = await loadJavaScriptRunnerModulePath();
  const evidence = await page.evaluate<
    InteractionBrowserEvidence,
    { readonly runnerModulePath: string; readonly html: string; readonly source: string }
  >(
    async ({ runnerModulePath, html, source }) => {
      const { JavaScriptRunnerAdapter } = (await import(/* @vite-ignore */ runnerModulePath)) as {
        readonly JavaScriptRunnerAdapter: typeof JavaScriptRunnerAdapterType;
      };
      const runner = new JavaScriptRunnerAdapter();
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.inset = '0';
      frame.style.pointerEvents = 'none';
      const parentFocus = document.createElement('button');
      parentFocus.textContent = '判定を開始';
      document.body.append(parentFocus, frame);
      parentFocus.focus();
      await runner.prepare(frame);
      const exerciseSessionId = crypto.randomUUID();
      const viewport: PreviewViewport = { id: 'desktop', width: 1280, height: 720 };
      const policy: SnapshotPolicy = {
        selectors: [
          '#question',
          '#score',
          '#result',
          '#input-status',
          '#category-status',
          '#key-status',
          '#next',
        ],
        attributes: ['hidden'],
        computedStyles: [],
        focusVisibleSelectors: [],
        focusVisibleComputedStyles: [],
        includeAllElements: false,
      };
      let executionRevision = 0;
      let requestSequence = 0;
      const generations: number[] = [];

      const render = async (): Promise<number> => {
        executionRevision += 1;
        const result = await runner.render({
          exerciseSessionId,
          executionRevision,
          languageId: 'javascript',
          files: { 'index.html': html, 'styles.css': '', 'script.js': source },
          assets: [],
          viewport,
          options: {
            runtime: {
              kind: 'javascript',
              entryFile: 'script.js',
              sourceType: 'script',
              capabilityProfile: 'project',
              primaryOutput: 'preview',
            },
          },
        });
        if (result.diagnostics.some(({ severity }) => severity === 'error')) {
          throw new Error(JSON.stringify(result.diagnostics));
        }
        if (result.frameGeneration === undefined) throw new Error('frameGenerationがありません');
        generations.push(result.frameGeneration);
        return result.frameGeneration;
      };
      const interact = async (
        frameGeneration: number,
        action: JavaScriptInteractionAction,
      ): Promise<readonly RunnerConsoleRecord[]> => {
        const requestId = `interaction-${String(++requestSequence)}`;
        const result = await runner.interact({
          exerciseSessionId,
          executionRevision,
          frameGeneration,
          requestId,
          action,
        });
        if (result.requestId !== requestId) throw new Error('Interaction identity不一致');
        return result.console;
      };
      const snapshot = async (): Promise<PreviewSnapshot> =>
        runner.requestSnapshot({
          exerciseSessionId,
          executionRevision,
          requestId: `snapshot-${String(++requestSequence)}`,
          policy,
          preserveTimers: true,
        });
      const snapshotNode = (snapshotResult: PreviewSnapshot, selector: string) => {
        const node = snapshotResult.nodes.find(({ matchedSelectors }) =>
          matchedSelectors.includes(selector),
        );
        if (node === undefined) throw new Error(`Snapshot Nodeがありません: ${selector}`);
        return node;
      };

      try {
        const answerGeneration = await render();
        let answerConsole = await interact(answerGeneration, {
          id: 'answer-1',
          kind: 'click',
          selector: '#answer',
        });
        const firstAnswer = await snapshot();
        answerConsole = await interact(answerGeneration, {
          id: 'answer-2',
          kind: 'click',
          selector: '#answer',
        });
        const secondAnswer = await snapshot();

        const retryGeneration = await render();
        const retryInitial = await snapshot();
        await interact(retryGeneration, {
          id: 'retry-answer-1',
          kind: 'click',
          selector: '#answer',
        });
        await interact(retryGeneration, {
          id: 'retry-answer-2',
          kind: 'click',
          selector: '#answer',
        });
        await interact(retryGeneration, { id: 'retry', kind: 'click', selector: '#retry' });
        const retryFinal = await snapshot();

        const formGeneration = await render();
        await interact(formGeneration, {
          id: 'fill',
          kind: 'fill',
          selector: '#name',
          value: 'Ada',
        });
        const filled = await snapshot();
        await interact(formGeneration, {
          id: 'select',
          kind: 'select',
          selector: '#category',
          value: 'css',
        });
        const selected = await snapshot();
        await interact(formGeneration, {
          id: 'enter',
          kind: 'key',
          selector: '#key-target',
          key: 'Enter',
        });
        const entered = await snapshot();
        await interact(formGeneration, {
          id: 'arrow',
          kind: 'key',
          selector: '#key-target',
          key: 'ArrowDown',
        });
        const arrowed = await snapshot();
        const formConsole = await interact(formGeneration, {
          id: 'focus-next',
          kind: 'focus',
          selector: '#next',
        });
        const focused = await snapshot();

        return {
          generations,
          answer: {
            scoreAfterFirst: snapshotNode(firstAnswer, '#score').text,
            questionAfterFirst: snapshotNode(firstAnswer, '#question').text,
            scoreAfterSecond: snapshotNode(secondAnswer, '#score').text,
            resultHiddenAfterSecond: Object.hasOwn(
              snapshotNode(secondAnswer, '#result').attributes,
              'hidden',
            ),
            console: answerConsole.map(({ text }) => text),
          },
          retry: {
            initialScore: snapshotNode(retryInitial, '#score').text,
            finalScore: snapshotNode(retryFinal, '#score').text,
            finalQuestion: snapshotNode(retryFinal, '#question').text,
            resultHidden: Object.hasOwn(snapshotNode(retryFinal, '#result').attributes, 'hidden'),
          },
          form: {
            input: snapshotNode(filled, '#input-status').text,
            category: snapshotNode(selected, '#category-status').text,
            enter: snapshotNode(entered, '#key-status').text,
            arrow: snapshotNode(arrowed, '#key-status').text,
            nextFocused: snapshotNode(focused, '#next').focused,
            console: formConsole.map(({ text }) => text),
          },
          parentFocusPreserved: document.activeElement === parentFocus,
        };
      } finally {
        await runner.dispose();
        frame.remove();
        parentFocus.remove();
      }
    },
    { runnerModulePath, html: HTML, source: SOURCE },
  );

  expect(new Set(evidence.generations).size).toBe(3);
  expect(evidence.answer).toEqual({
    scoreAfterFirst: '1点',
    questionAfterFirst: '問題2',
    scoreAfterSecond: '2点',
    resultHiddenAfterSecond: false,
    console: ['answer:1', 'answer:2'],
  });
  expect(evidence.retry).toEqual({
    initialScore: '0点',
    finalScore: '0点',
    finalQuestion: '問題1',
    resultHidden: true,
  });
  expect(evidence.form).toEqual({
    input: 'Ada',
    category: 'CSS',
    enter: 'Enter',
    arrow: 'ArrowDown',
    nextFocused: true,
    console: ['fill:Ada', 'select:css', 'key:Enter', 'key:ArrowDown'],
  });
  expect(evidence.parentFocusPreserved).toBe(true);
  expect(externalRequests).toEqual([]);
});
