import { expect, it } from 'vitest';
import {
  acceptsReactTemperatureScenarios,
  reactTemperatureScenarios,
} from '../../../src/core/content/reactTemperatureInteractions';
import {
  COMPONENT_DESIGN_MAIN,
  COMPONENT_DESIGN_HTML,
  isComponentDesignWorkspace,
} from '../../../src/adapters/runtime/react/componentDesignScaffold';
import { appOwnsTemperature } from '../../fixtures/reactComponentDesignSources';

it('操作・両表示・再操作と全wire fieldを要求し、未知goalを拒否する', () => {
  const scenarios = reactTemperatureScenarios();
  expect(acceptsReactTemperatureScenarios('temperature-panel', scenarios)).toBe(true);
  expect(acceptsReactTemperatureScenarios('counter', scenarios)).toBe(false);
  for (const changed of [
    undefined,
    [],
    [{ ...scenarios[0]!, extra: true }],
    [
      {
        ...scenarios[0]!,
        actions: scenarios[0]!.actions.map((action) => ({ ...action, extra: true })),
      },
    ],
    [{ ...scenarios[0]!, checkpoints: scenarios[0]!.checkpoints.slice(0, -1) }],
  ]) {
    expect(acceptsReactTemperatureScenarios('temperature-panel', changed)).toBe(false);
  }
});

it('保存とImportは固定起動/HTMLと編集componentsの3ファイルだけを受理する', () => {
  const files = {
    'components.tsx': appOwnsTemperature,
    'main.tsx': COMPONENT_DESIGN_MAIN,
    'index.html': COMPONENT_DESIGN_HTML,
  };
  expect(isComponentDesignWorkspace(files)).toBe(true);
  expect(isComponentDesignWorkspace({ ...files, 'types.ts': 'export type Extra = number;' })).toBe(
    false,
  );
  expect(
    isComponentDesignWorkspace({
      ...files,
      'main.tsx': COMPONENT_DESIGN_MAIN + '\nconsole.log("changed");',
    }),
  ).toBe(false);
  expect(
    isComponentDesignWorkspace({
      ...files,
      'index.html': COMPONENT_DESIGN_HTML.replace(
        '<div id="root">',
        '<span id="celsius">20</span><div id="root">',
      ),
    }),
  ).toBe(false);
});
