import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testBasePath } from './helpers/testBasePath';
import {
  createCases,
  evaluateCase,
  disposeFixtureHarness,
  loadJavaScriptFixtureRuntime,
  type BrowserFixtureCase,
} from './helpers/courseFixtureGate';

/** 実教材とは区別した操作fixtureで、初期状態・操作後・fresh frameの境界を実測する。 */
test('JavaScript Scenario fixtureは実click/inputを観測し、未操作の完成表示を合格にしない', async ({
  page,
}) => {
  const authoring = await loadAuthoringCourse('content/javascript');
  const source = authoring.exercises.find(({ id }) => id === 'javascript-ch00-l01-e01')!;
  const base = createCases([source])[0]!.exercise;
  const scenario = {
    id: 'button-flow',
    label: '押して入力する',
    actions: [
      { id: 'click', kind: 'click' as const, selector: '#button' },
      { id: 'input', kind: 'fill' as const, selector: '#name', value: '花子' },
      { id: 'again', kind: 'fill' as const, selector: '#name', value: '太郎' },
      { id: 'clear', kind: 'fill' as const, selector: '#name', value: '' },
    ],
    checkpoints: [
      {
        id: 'clicked',
        afterActionId: 'click',
        expectations: [
          { id: 'one', kind: 'selector-text' as const, selector: '#count', equals: '1' },
        ],
      },
      {
        id: 'typed',
        afterActionId: 'input',
        expectations: [
          { id: 'name', kind: 'selector-text' as const, selector: '#result', equals: '花子' },
        ],
      },
      {
        id: 'retyped',
        afterActionId: 'again',
        expectations: [
          { id: 'next', kind: 'selector-text' as const, selector: '#result', equals: '太郎' },
        ],
      },
      {
        id: 'cleared',
        afterActionId: 'clear',
        expectations: [
          { id: 'empty', kind: 'selector-text' as const, selector: '#result', equals: '' },
        ],
      },
    ],
  };
  const exercise: BrowserFixtureCase['exercise'] = {
    ...base,
    runtime: {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'dom',
      primaryOutput: 'preview',
    },
    validationRules: [
      {
        ...base.validationRules[0]!,
        id: 'query-call',
        target: { kind: 'javascript-source', file: 'script.js' },
        assertion: {
          kind: 'javascript-source-fact',
          fact: { kind: 'call', callee: 'document.querySelector' },
        },
      },
      {
        id: 'initial-count',
        hintId: base.validationRules[0]!.hintId,
        relatedSlideId: base.validationRules[0]!.relatedSlideId,
        label: '初期表示は0',
        required: true,
        group: 'all',
        viewportMode: 'all',
        viewportIds: base.previewViewports.map(({ id }) => id),
        target: { kind: 'selector', selector: '#count' },
        assertion: { kind: 'text', operator: 'equals', expected: '0' },
        feedback: { target: '#count', expected: '0', nextAction: '操作前の状態を確認する' },
      },
    ],
    interactionScenarios: [scenario, { ...scenario, id: 'fresh-flow' }],
  };
  const solution =
    "let count=0;const button=document.querySelector('#button');button.addEventListener('click',()=>{count+=1;document.querySelector('#count').textContent=String(count);});const field=document.querySelector('#name');field.addEventListener('input',event=>{document.querySelector('#result').textContent=event.currentTarget.value;});";
  await page.goto(testBasePath());
  const runtime = await loadJavaScriptFixtureRuntime();
  try {
    for (const [id, script, expected] of [
      ['solution', solution, 'pass'],
      ['wrong-event', solution.replace("'click'", "'mouseover'"), 'incomplete'],
      ['change-only', solution.replace("'input'", "'change'"), 'incomplete'],
      ['upfront', solution + "document.querySelector('#count').textContent='1';", 'incomplete'],
    ] as const) {
      const result = await evaluateCase(
        page,
        {
          id,
          exercise,
          workspaceAssets: [],
          expectedStatus: expected,
          files: {
            'index.html':
              '<button id="button">押す</button><input id="name" aria-label="名前"><p id="count">0</p><p id="result">待機中</p>',
            'script.js': script,
          },
        },
        runtime,
      );
      expect(result.status, JSON.stringify(result)).toBe(expected);
      if (id === 'solution') expect(result.checks.every(({ passed }) => passed)).toBe(true);
      if (id === 'wrong-event')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toEqual([
          'interaction:button-flow:clicked:one',
          'interaction:fresh-flow:clicked:one',
        ]);
      if (id === 'upfront')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toEqual([
          'initial-count',
        ]);
      if (id === 'change-only')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toEqual([
          'interaction:button-flow:typed:name',
          'interaction:button-flow:retyped:next',
          'interaction:button-flow:cleared:empty',
          'interaction:fresh-flow:typed:name',
          'interaction:fresh-flow:retyped:next',
          'interaction:fresh-flow:cleared:empty',
        ]);
    }
  } finally {
    await disposeFixtureHarness(page);
  }
});

/** trusted側の送信停止と学習handlerの取消を実Runner/Validatorで区別する。 */
test('Form Scenarioは同じnative submitのpreventDefaultだけを合格にする', async ({ page }) => {
  const authoring = await loadAuthoringCourse('content/javascript');
  const base = createCases([authoring.exercises[0]!])[0]!.exercise;
  const exercise: BrowserFixtureCase['exercise'] = {
    ...base,
    runtime: {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'dom-form',
      primaryOutput: 'preview',
    },
    validationRules: [
      {
        ...base.validationRules[0]!,
        id: 'initial-display',
        target: { kind: 'selector', selector: '#result' },
        assertion: { kind: 'text', operator: 'equals', expected: '待機中' },
      },
      {
        ...base.validationRules[0]!,
        id: 'query-call',
        target: { kind: 'javascript-source', file: 'script.js' },
        assertion: {
          kind: 'javascript-source-fact',
          fact: { kind: 'call', callee: 'document.querySelector' },
        },
      },
    ],
    interactionScenarios: [
      {
        id: 'submit',
        label: '送信を止めて表示する',
        actions: [{ id: 'send', kind: 'click', selector: '#send' }],
        checkpoints: [
          {
            id: 'handled',
            afterActionId: 'send',
            expectations: [
              { id: 'cancel', kind: 'submit-prevented' },
              { id: 'display', kind: 'selector-text', selector: '#result', equals: '確認した' },
            ],
          },
        ],
      },
    ],
  };
  const solution =
    "const form=document.querySelector('#form');form.addEventListener('submit',event=>{event.preventDefault();document.querySelector('#result').textContent='確認した';});";
  await page.goto(testBasePath());
  const runtime = await loadJavaScriptFixtureRuntime();
  try {
    for (const [id, script, expected] of [
      ['solution', solution, 'pass'],
      ['missing-cancel', solution.replace('event.preventDefault();', ''), 'incomplete'],
      [
        'unreachable-cancel',
        solution.replace('event.preventDefault();', 'if(false){event.preventDefault();}'),
        'incomplete',
      ],
      ['wrong-event', solution.replace("'submit'", "'click'"), 'incomplete'],
    ] as const) {
      const result = await evaluateCase(
        page,
        {
          id,
          exercise,
          workspaceAssets: [],
          expectedStatus: expected,
          files: {
            'index.html':
              '<form id="form"><input aria-label="名前"><button id="send" type="submit">確認</button></form><p id="result">待機中</p>',
            'script.js': script,
          },
        },
        runtime,
      );
      expect(result.status, JSON.stringify(result)).toBe(expected);
      if (id !== 'solution')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toContain(
          'interaction:submit:handled:cancel',
        );
    }
  } finally {
    await disposeFixtureHarness(page);
  }
});
