import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import JSXRuntime from 'react/jsx-runtime';
import type { ReactNode } from 'react';

export const { jsx, jsxs, Fragment } = JSXRuntime;

interface BoundaryProps {
  readonly children: ReactNode;
  readonly report: (error: unknown) => void;
}

/** 初回の子Component描画失敗だけを捕捉する。イベントや非同期例外を隠さない。 */
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

/** 最初のProps課題は同期commit後に完了を返す。管理画面のReact instanceと共有しない。 */
export function createRoot(container: HTMLElement): { render(node: ReactNode): void } {
  let failure: unknown;
  let failed = false;
  const report = (error: unknown): void => {
    failed = true;
    failure = error;
  };
  const root = ReactDOM.createRoot(container, { onCaughtError: report, onUncaughtError: report });
  return Object.freeze({
    render(node: ReactNode): void {
      flushSync(() => {
        root.render(React.createElement(PreviewBoundary, { report, children: node }));
      });
      if (failed) throw failure;
    },
  });
}
