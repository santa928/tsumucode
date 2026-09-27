import type { RunnerDiagnostic } from '../../../../core/runtime/contracts';

export type CurrentTargetFailure = 'unsupported' | 'setup-error' | null;

/** 認証済みの有限な保護状態を初回とinteractionで同じ非採点診断へ変換する。 */
export function currentTargetDiagnostics(failure: CurrentTargetFailure): RunnerDiagnostic[] {
  if (failure === null) return [];
  return [
    {
      code:
        failure === 'setup-error'
          ? 'javascript-current-target-setup'
          : 'javascript-current-target-unsupported',
      kind: failure === 'setup-error' ? 'system' : 'unsupported',
      severity: 'error',
      message:
        failure === 'setup-error'
          ? 'currentTarget guard setup failed'
          : 'currentTarget receiver unsupported',
      learnerMessage:
        failure === 'setup-error'
          ? '実行環境の安全な準備ができませんでした。もう一度プレビューを更新してください。'
          : 'この環境のcurrentTargetは、同じ画面のElementに登録したイベントだけに対応しています。今回の判定は保存しません。',
    },
  ];
}

/** 学習codeの前にnative getterを捕捉し、同じDocumentのElementとnullだけを返す。
 * 自己完結sourceとしてiframeへ埋め込む。設置失敗時は学習codeを開始しないこと。
 */
export function installCurrentTargetGuard(target: Document, onUnsupported: () => void): boolean {
  'use strict';
  const view = target.defaultView;
  if (view === null) return false;
  const apply = Reflect.apply.bind(Reflect);
  const describe = Object.getOwnPropertyDescriptor.bind(Object);
  const define = Object.defineProperty.bind(Object);
  const nativeCurrent = describe(view.Event.prototype, 'currentTarget');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- native receiverをReflect.applyで明示する。
  const currentGetter = nativeCurrent?.get;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- native receiverをReflect.applyで明示する。
  const elementGetter = describe(view.Element.prototype, 'localName')?.get;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- native receiverをReflect.applyで明示する。
  const ownerGetter = describe(view.Node.prototype, 'ownerDocument')?.get;
  const NativeError = Error;
  if (currentGetter === undefined || elementGetter === undefined || ownerGetter === undefined) {
    return false;
  }
  const guarded = function (this: Event): EventTarget | null {
    const value: unknown = apply(currentGetter, this, []);
    if (value === null) return null;
    let allowed = false;
    try {
      apply(elementGetter, value, []);
      allowed = apply(ownerGetter, value, []) === target;
    } catch {
      // native getterのbrand検査で非Elementや偽のnodeTypeを拒否する。
    }
    if (allowed) return value as Element;
    onUnsupported();
    throw new NativeError('currentTarget receiver unsupported');
  };
  try {
    define(view.Event.prototype, 'currentTarget', {
      get: guarded,
      enumerable: nativeCurrent?.enumerable === true,
      configurable: false,
    });
    const installed = describe(view.Event.prototype, 'currentTarget');
    return (
      installed?.get === guarded && installed.set === undefined && installed.configurable === false
    );
  } catch {
    return false;
  }
}
