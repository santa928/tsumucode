import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type * as JavaScriptRuntime from '../../src/adapters/runtime/javascript';
import type { RunnerAdapter } from '../../src/core/runtime/contracts';
import { loadJavaScriptRunnerModulePath } from './helpers/javascriptRunnerModule';
import { testBasePath } from './helpers/testBasePath';

/** 実Browserの既定activationとtrusted keyを、同じSource・DOM・profileで比較する。 */
test('native type=buttonのkeyは取消・disabled・独自clickを実Browserと同じ順で扱う', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto(testBasePath());
  const entry = await loadJavaScriptRunnerModulePath();
  await page.evaluate(async (entry) => {
    const { JavaScriptRunnerAdapter } = (await import(
      /* @vite-ignore */ new URL(entry, location.href).href
    )) as typeof JavaScriptRuntime;
    const runner = new JavaScriptRunnerAdapter();
    const frame = document.createElement('iframe');
    frame.id = 'native-key-fixture';
    document.body.append(frame);
    await runner.prepare(frame);
    (window as typeof window & { nativeKeyRunner: RunnerAdapter }).nativeKeyRunner = runner;
  }, entry);
  const frame = page.frameLocator('#native-key-fixture');
  const rows = [];
  let revision = 0;
  const cases = [
    {
      id: 'normal',
      code: '',
      disabled: false,
      fieldset: false,
      expected: { Enter: 1, Space: 1, Escape: 0 },
    },
    {
      id: 'keydown-consumed',
      code: 'button.addEventListener("keydown",event=>event.preventDefault());',
      disabled: false,
      fieldset: false,
      expected: { Enter: 0, Space: 0, Escape: 0 },
    },
    {
      id: 'keyup-consumed',
      code: 'button.addEventListener("keyup",event=>event.preventDefault());',
      disabled: false,
      fieldset: false,
      expected: { Enter: 1, Space: 0, Escape: 0 },
    },
    {
      id: 'explicit-click',
      code: 'button.addEventListener("keydown",()=>button.click());',
      disabled: false,
      fieldset: false,
      expected: { Enter: 2, Space: 2, Escape: 1 },
    },
    {
      id: 'explicit-click-consumed',
      code: 'button.addEventListener("keydown",event=>{button.click();event.preventDefault();});',
      disabled: false,
      fieldset: false,
      expected: { Enter: 1, Space: 1, Escape: 1 },
    },
    {
      id: 'disabled-button',
      code: 'button.addEventListener("keydown",()=>button.click());',
      disabled: true,
      fieldset: false,
      expected: { Enter: 0, Space: 0, Escape: 0 },
    },
    {
      id: 'disabled-fieldset',
      code: 'button.addEventListener("keydown",()=>button.click());',
      disabled: false,
      fieldset: true,
      expected: { Enter: 0, Space: 0, Escape: 0 },
    },
  ];
  try {
    for (const profile of ['project', 'dom'] as const)
      for (const candidate of cases)
        for (const key of ['Enter', 'Space', 'Escape'] as const)
          for (const mode of ['actual-browser', 'trusted-key'] as const) {
            revision += 1;
            const rendered = await page.evaluate(
              async ({ profile, candidate, revision }) => {
                const runner = (window as typeof window & { nativeKeyRunner: RunnerAdapter })
                  .nativeKeyRunner;
                return runner.render({
                  exerciseSessionId: 'native-key',
                  executionRevision: revision,
                  languageId: 'javascript',
                  files: {
                    'index.html':
                      '<!doctype html><html lang="ja"><body>' +
                      (candidate.fieldset ? '<fieldset id="group">' : '') +
                      '<button id="button" type="button"' +
                      (candidate.disabled ? ' disabled' : '') +
                      '>回答</button>' +
                      (candidate.fieldset ? '</fieldset>' : '') +
                      '<p id="count">0</p></body></html>',
                    'styles.css': '',
                    'main.js':
                      'const button=document.querySelector("#button");let count=0;button.addEventListener("click",()=>{count+=1;document.querySelector("#count").textContent=String(count);});' +
                      (candidate.fieldset
                        ? 'document.querySelector("#group").disabled=true;'
                        : '') +
                      candidate.code,
                  },
                  assets: [],
                  viewport: { id: 'desktop', width: 1280, height: 720 },
                  options: {
                    runtime: {
                      kind: 'javascript',
                      entryFile: 'main.js',
                      sourceType: 'script',
                      capabilityProfile: profile,
                      primaryOutput: 'preview',
                    },
                  },
                });
              },
              { profile, candidate, revision },
            );
            expect(rendered.diagnostics).toEqual([]);
            if (mode === 'actual-browser')
              await frame.locator('#button').press(key === 'Space' ? 'Space' : key);
            else {
              const interaction = await page.evaluate(
                async ({ revision, generation, key }) => {
                  const runner = (window as typeof window & { nativeKeyRunner: RunnerAdapter })
                    .nativeKeyRunner;
                  if (runner.interact === undefined) throw new Error('Interaction missing');
                  return runner.interact({
                    exerciseSessionId: 'native-key',
                    executionRevision: revision,
                    frameGeneration: generation,
                    requestId: 'key-' + String(revision),
                    action: {
                      id: 'key-' + String(revision),
                      kind: 'key',
                      selector: '#button',
                      key,
                    },
                  });
                },
                { revision, generation: rendered.frameGeneration!, key },
              );
              expect(interaction.diagnostics).toEqual([]);
            }
            const count = Number(await frame.locator('#count').textContent());
            rows.push({
              profile,
              case: candidate.id,
              key,
              mode,
              count,
              expected: candidate.expected[key],
            });
            expect
              .soft(count, `${profile}/${candidate.id}/${key}/${mode}`)
              .toBe(candidate.expected[key]);
          }
    // 他のelement/typeは既定activationを追加しない。通常clickは既存のnative経路を維持する。
    revision += 1;
    const generation = await page.evaluate(async (revision) => {
      const runner = (window as typeof window & { nativeKeyRunner: RunnerAdapter }).nativeKeyRunner;
      const rendered = await runner.render({
        exerciseSessionId: 'native-key',
        executionRevision: revision,
        languageId: 'javascript',
        files: {
          'index.html':
            '<!doctype html><html lang="ja"><body><button id="submit" type="submit">送信</button><div id="plain" tabindex="0">その他</div><p id="count">0</p></body></html>',
          'styles.css': '',
          'main.js':
            'document.querySelector("#submit").addEventListener("click",()=>{document.querySelector("#count").textContent="1";});',
        },
        assets: [],
        viewport: { id: 'desktop', width: 1280, height: 720 },
        options: {
          runtime: {
            kind: 'javascript',
            entryFile: 'main.js',
            sourceType: 'script',
            capabilityProfile: 'project',
            primaryOutput: 'preview',
          },
        },
      });
      if (runner.interact === undefined) throw new Error('Interaction missing');
      for (const selector of ['#submit', '#plain'])
        await runner.interact({
          exerciseSessionId: 'native-key',
          executionRevision: revision,
          frameGeneration: rendered.frameGeneration!,
          requestId: selector,
          action: { id: selector, kind: 'key', selector, key: 'Enter' },
        });
      return rendered.frameGeneration!;
    }, revision);
    await expect(frame.locator('#count')).toHaveText('0');
    await page.evaluate(
      async ({ revision, generation }) => {
        const runner = (window as typeof window & { nativeKeyRunner: RunnerAdapter })
          .nativeKeyRunner;
        if (runner.interact === undefined) throw new Error('Interaction missing');
        return runner.interact({
          exerciseSessionId: 'native-key',
          executionRevision: revision,
          frameGeneration: generation,
          requestId: 'ordinary-click',
          action: { id: 'ordinary-click', kind: 'click', selector: '#submit' },
        });
      },
      { revision, generation },
    );
    await expect(frame.locator('#count')).toHaveText('1');
  } finally {
    await writeFile(
      test.info().outputPath('native-key-evidence.json'),
      JSON.stringify(rows, null, 2),
    );
    await page.evaluate(async () => {
      await (
        window as typeof window & { nativeKeyRunner: RunnerAdapter }
      ).nativeKeyRunner.dispose();
      document.getElementById('native-key-fixture')?.remove();
    });
  }
});
