import { describe, expect, it } from 'vitest';
import { analyzeComponentDesign } from '../../../src/adapters/runtime/react/checkComponentDesignSource';
import {
  appOwnsTemperature,
  panelOwnsTemperature,
  siblingDisplays,
  unusedDisplay,
  dummyState,
  frozenAfterReset,
  oneSideFrozen,
} from '../../fixtures/reactComponentDesignSources';

describe('Component境界とState所有者を固定しない温度課題', () => {
  it.each([appOwnsTemperature, panelOwnsTemperature, siblingDisplays])(
    '所有者・Props名・通常function/arrow・変換位置・Callback転送の別解を受理する %#',
    (source) => {
      const result = analyzeComponentDesign(source);
      expect(result.diagnostics).toEqual([]);
      expect(result.facts).toEqual({ rendersAuthoredDisplay: true, usesInteractiveState: true });
    },
  );
  it('使われない表示部品はDOMで両値が動いても自作部品使用としない', () => {
    const result = analyzeComponentDesign(unusedDisplay);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.rendersAuthoredDisplay).toBe(false);
  });

  it('温度のJSXを一時変数へ置いて同じspan内で使う別解を認める', () => {
    const source = appOwnsTemperature
      .replace(
        '  const converted = degrees * 9 / 5 + 32;',
        '  const converted = degrees * 9 / 5 + 32;\n  const celsiusText = <>{degrees}</>;\n  const fahrenheitText = <>{converted}</>;',
      )
      .replace('id="celsius">{degrees}', 'id="celsius">{celsiusText}')
      .replace('id="fahrenheit">{converted}', 'id="fahrenheit">{fahrenheitText}');
    const result = analyzeComponentDesign(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts).toEqual({ rendersAuthoredDisplay: true, usesInteractiveState: true });
  });

  it('返さないJSX変数の構文検査を部品の実使用としない', () => {
    const source = unusedDisplay.replace(
      '  function raise()',
      '  const detached = <Reading degrees={temperature} />;\n  const neverUsed = <div>{detached}</div>;\n  function raise()',
    );
    const result = analyzeComponentDesign(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.rendersAuthoredDisplay).toBe(false);
    expect(result.facts.usesInteractiveState).toBe(true);
  });
  it('State所有者を固定せず、名前付き操作関数の宣言位置もStateの後へ固定しない', () => {
    const declaration = '  const [temperature, changeTemperature] = useState(20);\n';
    const source = appOwnsTemperature
      .replace(declaration, '')
      .replace(
        '  function raise() { changeTemperature(temperature + 1); }',
        '  function raise() { changeTemperature(temperature + 1); }\n' + declaration.trimEnd(),
      );
    const result = analyzeComponentDesign(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts).toEqual({ rendersAuthoredDisplay: true, usesInteractiveState: true });
  });
  it('宣言とsetterだけ存在するStateを表示につながるStateとしない', () => {
    const result = analyzeComponentDesign(dummyState);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.usesInteractiveState).toBe(false);
  });
  it('温度の外に常数だけの飾り部品を足しても表示部品の条件を満たさない', () => {
    const source = unusedDisplay.replace(
      '<h1>温度表示</h1>',
      '<h1>温度表示</h1><Reading degrees={20} />',
    );
    expect(analyzeComponentDesign(source).facts.rendersAuthoredDisplay).toBe(false);
  });
  it('State数や数式を固定せず、片側固定・Reset後停止は実操作の判定へ残す', () => {
    for (const source of [frozenAfterReset, oneSideFrozen]) {
      const result = analyzeComponentDesign(source);
      expect(result.diagnostics).toEqual([]);
      expect(result.facts).toEqual({ rendersAuthoredDisplay: true, usesInteractiveState: true });
    }
  });
  it('数値をPropsで受けても表示せず属性へ隠す部品を表示部品としない', () => {
    const source = appOwnsTemperature.replace(
      '<p>摂氏 <span id="celsius">{degrees}</span> ℃</p>\n    <p>華氏 <span id="fahrenheit">{converted}</span> ℉</p>',
      '<div aria-label={degrees}></div>',
    );
    const result = analyzeComponentDesign(source);
    expect(result.facts.rendersAuthoredDisplay).toBe(false);
  });
  it.each([
    appOwnsTemperature.replace(
      'changeTemperature(20)',
      'document.getElementById("celsius").textContent = "20"',
    ),
    appOwnsTemperature.replace('useState }', 'useState, useEffect }'),
    appOwnsTemperature.replace(
      'const converted = degrees * 9 / 5 + 32;',
      'const converted = window.localStorage.getItem("temperature");',
    ),
    appOwnsTemperature.replace('function Reading(', 'async function Reading('),
    appOwnsTemperature.replace(
      '<Reading degrees={temperature} />',
      '<Reading {...{ degrees: temperature }} />',
    ),
    appOwnsTemperature.replace(
      'const [temperature,',
      'if (true) { useState(20); }\n const [temperature,',
    ),
    appOwnsTemperature.replace(
      '<span id="celsius">',
      '<span dangerouslySetInnerHTML={{ __html: "20" }}>',
    ),
    appOwnsTemperature.replace('{degrees}', '{degrees as any}'),
    appOwnsTemperature.replace('<Reading degrees={temperature} />', '<App />'),
    '// @ts-ignore\n' + appOwnsTemperature,
  ])('有限構文外の能力・条件内Hook・再帰を閉じたまま拒否する %#', (source) => {
    expect(analyzeComponentDesign(source).diagnostics.length).toBeGreaterThan(0);
  });
});
