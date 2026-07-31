import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog, fixtureCourse } from '../../tests/fixtures/course';
import { App } from './App';
import { createAppRouter } from './router';

const originalHash = window.location.hash;
let router: ReturnType<typeof createAppRouter> | undefined;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Response.json(url.endsWith('html-css.json') ? fixtureCourse : fixtureCatalog);
    }),
  );
});

afterEach(() => {
  router?.dispose();
  router = undefined;
  window.location.hash = originalHash;
  vi.unstubAllGlobals();
});

/** Testごとに所有・破棄できるRouterでAppを描画する。 */
function renderApp() {
  router = createAppRouter();
  return render(<App router={router} />);
}

describe('App', () => {
  it('TsumuCodeの教材Catalogを開始地点として表示する', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: '学びたいピースを選ぶ' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: fixtureCatalog.learningPaths[0]!.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: fixtureCatalog.courses[0]!.title }),
    ).toHaveTextContent(fixtureCatalog.courses[0]!.title);
    expect(screen.getByText('公開中')).toBeInTheDocument();
    expect(screen.queryByText('現在のピース')).not.toBeInTheDocument();
  });

  it('各テストを独立したDOMで描画する', async () => {
    renderApp();
    expect(await screen.findAllByRole('heading', { name: '学びたいピースを選ぶ' })).toHaveLength(1);
  });
});
