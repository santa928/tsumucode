import { STATIC_COMPONENTS_MAIN } from './staticComponentsScaffold';
import { INTERACTIVE_STATE_HTML } from './interactiveStateScaffold';

export const COMPONENT_DESIGN_MAIN = STATIC_COMPONENTS_MAIN;
export const COMPONENT_DESIGN_HTML = INTERACTIVE_STATE_HTML.replace(
  '操作でStateを更新する',
  '自分で組み立てる温度表示',
);

/** 固定するのはAppを呼ぶ入口だけ。Props型とState所有者は学習者が決める。 */
export function isComponentDesignScaffold(files: Readonly<Record<string, string>>): boolean {
  return (
    Object.keys(files).sort().join(',') === 'components.tsx,main.tsx' &&
    files['main.tsx']?.trim() === COMPONENT_DESIGN_MAIN.trim()
  );
}

/** 保存・Import・描画・採点に同じ3Fileを要求する。 */
export function isComponentDesignWorkspace(files: Readonly<Record<string, string>>): boolean {
  return (
    Object.keys(files).sort().join(',') === 'components.tsx,index.html,main.tsx' &&
    isComponentDesignScaffold(
      Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'index.html')),
    ) &&
    files['index.html']?.trim() === COMPONENT_DESIGN_HTML.trim()
  );
}
