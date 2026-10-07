import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import JSXRuntime from 'react/jsx-runtime';
import type { ReactNode } from 'react';

// Analyzerだけが固定moduleへ注入する。Learner向けexportやglobal APIへ公開しない。
declare const __tsumucodeReportReactError: (error: unknown) => void;

/** ReactがEvent例外を内部捕捉しても、学習者の元例外を同世代のBridgeへ渡す。 */
function guardedProps(props: unknown): unknown {
  if (!props || typeof props !== 'object') return props;
  const values = props as Readonly<Record<string, unknown>>;
  const callback = values['onClick'];
  if (typeof callback !== 'function') return props;
  const click = callback as (...args: unknown[]) => unknown;
  return {
    ...values,
    onClick(...args: unknown[]): unknown {
      try {
        return click(...args);
      } catch (error: unknown) {
        __tsumucodeReportReactError(error);
        return undefined;
      }
    },
  };
}

export const Fragment = JSXRuntime.Fragment;
export const jsx: typeof JSXRuntime.jsx = (type, props, key) =>
  JSXRuntime.jsx(type, guardedProps(props), key);
export const jsxs: typeof JSXRuntime.jsxs = (type, props, key) =>
  JSXRuntime.jsxs(type, guardedProps(props), key);
export const useState = React.useState;

interface BoundaryProps {
  readonly children: ReactNode;
  readonly report: (error: unknown) => void;
}

/** 子Componentの描画失敗を捕捉し、同期初回と操作後の失敗を既存Bridgeへ伝える。 */
class PreviewBoundary extends React.Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    this.props.report(error);
  }
  render(): ReactNode {
    return this.state.failed
      ? React.createElement(
          'p',
          { role: 'alert' },
          '表示中にエラーが起きました。コードを確認してください。',
        )
      : this.props.children;
  }
}

/** 初回は同期commit後に完了を返す。管理画面のReact instanceと共有しない。 */
export function createRoot(container: HTMLElement): { render(node: ReactNode): void } {
  let failure: unknown;
  let failed = false;
  let initialized = false;
  const report = (error: unknown): void => {
    if (failed && failure === error) return;
    failed = true;
    failure = error;
    // Reactが内部で捕捉した更新時の失敗も、既存Bridgeの同世代error観測へ通知する。
    if (initialized) __tsumucodeReportReactError(error);
  };
  const root = ReactDOM.createRoot(container, { onCaughtError: report, onUncaughtError: report });
  return Object.freeze({
    render(node: ReactNode): void {
      flushSync(() => {
        root.render(React.createElement(PreviewBoundary, { report, children: node }));
      });
      initialized = true;
      if (failed) throw failure;
    },
  });
}
