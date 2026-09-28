import type { RunnerDiagnostic, SubmitEvidence } from '../../../../core/runtime/contracts';

/** 設置失敗はsystem障害として返し、学習者の採点履歴へ保存させない。 */
export function submitDiagnostics(evidence: SubmitEvidence): RunnerDiagnostic[] {
  return evidence === 'setup-error'
    ? [
        {
          code: 'javascript-submit-setup',
          kind: 'system',
          severity: 'error',
          message: 'Submit observation guard setup failed',
          learnerMessage: 'Formの安全な実行準備ができませんでした。今回の判定は保存しません。',
        },
      ]
    : [];
}

/** 1件の認証Interactionだけに属するnative submit取消の観測。 */
export interface SubmitObservation {
  begin(): void;
  end(): boolean;
}

/** native取消とは別に、同じsubmitのhandler中のlearner呼出しを閉包で記録する。
 * 自己完結sourceとしてiframeへ埋め込む。設置できなければ学習codeを実行しない。
 */
export function installSubmitGuard(
  target: Document,
  isLearnerExecuting: () => boolean,
): SubmitObservation | null {
  'use strict';
  const view = target.defaultView;
  if (view === null) return null;
  const apply = Reflect.apply.bind(Reflect);
  const describe = Object.getOwnPropertyDescriptor.bind(Object);
  const define = Object.defineProperty.bind(Object);
  const EventPrototype = view.Event.prototype;
  const original = describe(EventPrototype, 'preventDefault');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉済みnative methodへreceiverを明示する。
  const nativePrevent = EventPrototype.preventDefault;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- native getterへEvent receiverを明示する。
  const typeGetter = describe(EventPrototype, 'type')?.get;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- native getterへEvent receiverを明示する。
  const phaseGetter = describe(EventPrototype, 'eventPhase')?.get;
  const nativeAdd = target.addEventListener.bind(target);
  if (original === undefined || typeGetter === undefined || phaseGetter === undefined) return null;
  let active = false;
  let overflow = false;
  let observed: Event[] = [];
  let prevented: Event[] = [];
  const guarded = function (this: Event): void {
    // native brand checkを先に行い、偽receiverを観測として受理しない。
    apply(nativePrevent, this, []);
    if (
      active &&
      isLearnerExecuting() &&
      apply(typeGetter, this, []) === 'submit' &&
      Number(apply(phaseGetter, this, [])) > 0 &&
      observed.includes(this) &&
      !prevented.includes(this)
    ) {
      prevented[prevented.length] = this;
    }
  };
  try {
    define(EventPrototype, 'preventDefault', {
      value: guarded,
      writable: false,
      configurable: false,
      enumerable: original.enumerable === true,
    });
    const installed = describe(EventPrototype, 'preventDefault');
    if (installed?.value !== guarded || installed.writable || installed.configurable) return null;
    nativeAdd(
      'submit',
      (event) => {
        if (!active || !event.isTrusted || apply(typeGetter, event, []) !== 'submit') return;
        if (observed.length >= 16) {
          overflow = true;
          return;
        }
        observed[observed.length] = event;
      },
      true,
    );
  } catch {
    return null;
  }
  return {
    begin(): void {
      active = true;
      overflow = false;
      observed = [];
      prevented = [];
    },
    end(): boolean {
      active = false;
      const complete =
        !overflow && observed.length > 0 && observed.every((event) => prevented.includes(event));
      observed = [];
      prevented = [];
      return complete;
    },
  };
}
