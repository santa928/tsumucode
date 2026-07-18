/** Viewportとprimary pointerだけから、ブラウザ内編集を安全に提供できるか判定する。 */
import { useSyncExternalStore } from 'react';

export const EDITING_CAPABILITY_QUERY = '(min-width: 1024px) and (pointer: fine)';

export interface EditingCapabilityInput {
  viewportWidth: number;
  primaryPointer: 'fine' | 'coarse' | 'none';
}

/** テスト可能な純粋関数として、編集に必要な最小画面幅とポインター精度を評価する。 */
export function isEditingCapable({
  viewportWidth,
  primaryPointer,
}: EditingCapabilityInput): boolean {
  return viewportWidth >= 1024 && primaryPointer === 'fine';
}

/** 現在のBrowserが共有編集条件を満たすか読み取る。SSRでは常にfalseを返す。 */
function readEditingCapability(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(EDITING_CAPABILITY_QUERY).matches;
}

/** 共有Media Queryの変化を購読し、解除関数を返す。 */
function subscribeToEditingCapability(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const mediaQueryList = window.matchMedia(EDITING_CAPABILITY_QUERY);
  mediaQueryList.addEventListener('change', onStoreChange);

  return () => {
    mediaQueryList.removeEventListener('change', onStoreChange);
  };
}

/** React画面から編集可否を購読し、Hydration時は安全側のfalseを返す。 */
export function useEditingCapability(): boolean {
  return useSyncExternalStore(subscribeToEditingCapability, readEditingCapability, () => false);
}
