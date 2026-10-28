import catalog from './compiled-native-workspaces.json' with { type: 'json' };
// Compilerが列挙したIDに既知の有限契約だけを結び付ける。APIから設定を追加させない。
import { ROUTING_STARTER_FILES, BOUNDARY_STARTER_FILES } from './next-routing-source.mjs';
import { DATA_STARTER_FILES, WEATHER_STARTER_FILES } from './next-data-source.mjs';
import { FORM_STARTER_FILES, ACTION_STARTER_FILES } from './next-form-source.mjs';
import {
  GUIDED_PROJECT_STARTER_FILES,
  CAPSTONE_PROJECT_STARTER_FILES,
  NEXT_PROJECT_RULE_GOALS,
} from './next-production-source.mjs';
export const NEXT_PROFILE = 'next-project-v1';
export const NEXT_WORKSPACE = 'next-ch01-l01-e01';
export const NEXT_STARTER_FILES = Object.freeze({
  'app/layout.tsx': `import type { ReactNode } from 'react';
import './globals.css';

/** 全pageを日本語のHTMLで囲む。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
`,
  'app/page.tsx': `/** pageの見出しを返す。APIのJSONとは別の応答。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">こんにちは、Starter！</h1>
      <p>見出しと、queryが異なる2つのHTTP応答を確かめます。</p>
    </main>
  );
}
`,
  'app/globals.css': `body {
  font-family: sans-serif;
  margin: 2rem;
}
`,
  'app/api/question/route.ts': `/** queryを受け取りJSONを返す。外部APIや秘密情報は使わない。 */
export function GET(request: Request): Response {
  const second = new URL(request.url).searchParams.get('mode') === 'second';
  return Response.json({
    message: second ? '最初の実リクエスト' : '最初の実リクエスト',
  });
}
`,
});

export const NEXT_WORKSPACES = Object.freeze({
  'next-ch05-l01-e01': {
    files: GUIDED_PROJECT_STARTER_FILES,
    goal: 'guided-travel-project',
    ruleGoals: NEXT_PROJECT_RULE_GOALS,
    pages: [
      '',
      'trips',
      'trips/forest',
      'trips/sea',
      'trips?area=all',
      'trips?area=outdoor',
      'trips?area=indoor',
      'trips?area=unknown',
      'api/catalog',
      'banner.svg',
    ],
    previewLabels: [
      '入口と画像',
      '旅の一覧',
      '森の詳細',
      '資料館の詳細',
      'すべて',
      '屋外だけ',
      '室内だけ',
      '不正な選択',
      '実JSON',
      '固定画像',
    ],
    readonlyFiles: [
      'app/layout.tsx',
      'app/globals.css',
      'app/data.ts',
      'app/catalog.ts',
      'app/api/catalog/route.ts',
      'public/banner.svg',
    ],
  },
  'next-ch06-l01-e01': {
    files: CAPSTONE_PROJECT_STARTER_FILES,
    goal: 'capstone-event-project',
    ruleGoals: NEXT_PROJECT_RULE_GOALS,
    pages: [
      '',
      'events',
      'events/morning',
      'events/evening',
      'events?availability=all',
      'events?availability=open',
      'events?availability=full',
      'events?availability=unknown',
      'api/catalog',
      'banner.svg',
    ],
    previewLabels: [
      '入口と画像',
      '読書会一覧',
      '朝の詳細',
      '夕方の詳細',
      'すべて',
      '受付中だけ',
      '受付終了だけ',
      '不正な選択',
      '実JSON',
      '固定画像',
    ],
    readonlyFiles: [
      'app/layout.tsx',
      'app/globals.css',
      'app/data.ts',
      'app/catalog.ts',
      'app/api/catalog/route.ts',
      'public/banner.svg',
    ],
  },
  [NEXT_WORKSPACE]: {
    files: NEXT_STARTER_FILES,
    goal: 'page-route-query',
    pages: ['', 'api/question', 'api/question?mode=second'],
    previewLabels: ['pageの表示', 'JSON応答: queryなし', 'JSON応答: mode=second'],
  },
  'next-ch02-l01-e01': {
    files: ROUTING_STARTER_FILES,
    goal: 'nested-dynamic-navigation',
    pages: ['', 'trips', 'trips/forest', 'trips/sea'],
    previewLabels: ['入口の表示', '旅行一覧', '森の詳細', '海の詳細'],
  },
  'next-ch02-l02-e01': {
    files: BOUNDARY_STARTER_FILES,
    goal: 'server-client-counter',
    pages: [''],
    previewLabels: ['ServerとClientの表示'],
  },
  'next-ch04-l01-e01': {
    files: FORM_STARTER_FILES,
    goal: 'form-route-validation',
    pages: [''],
    previewLabels: ['FormとServer validation'],
    readonlyFiles: [
      'app/layout.tsx',
      'app/globals.css',
      'app/page.tsx',
      'app/note-state.ts',
      'app/note-store.ts',
    ],
  },
  'next-ch04-l02-e01': {
    files: ACTION_STARTER_FILES,
    goal: 'server-action-validation',
    pages: [''],
    previewLabels: ['Server Actionの再試行'],
    readonlyFiles: [
      'app/layout.tsx',
      'app/globals.css',
      'app/page.tsx',
      'app/note-state.ts',
      'app/note-store.ts',
    ],
  },
  'next-ch03-l01-e01': {
    files: DATA_STARTER_FILES,
    goal: 'data-cache-revalidation',
    pages: ['', 'data/fresh', 'data/cached', 'data/revalidate'],
    previewLabels: ['取得と保持の入口', '毎回取得', '保持した値', '期限後の更新'],
    readonlyFiles: [
      'app/globals.css',
      'app/layout.tsx',
      'app/data-url.ts',
      'app/page.tsx',
      'app/api/sample/route.ts',
    ],
  },
  'next-ch03-l02-e01': {
    files: WEATHER_STARTER_FILES,
    goal: 'loading-error-not-found',
    pages: ['', 'weather/clear', 'weather/slow', 'weather/flaky', 'weather/missing'],
    previewLabels: ['状態の入口', '正常な応答', '遅い応答', '一度失敗', '対象なし'],
    readonlyFiles: [
      'app/globals.css',
      'app/layout.tsx',
      'app/data-url.ts',
      'app/page.tsx',
      'app/api/weather/route.ts',
      'app/weather/[state]/not-found.tsx',
    ],
  },
});

/** Finite trusted implementation primitives; catalog entries contain no executable code. */
export function nextTemplate(goal) {
  return Object.values(NEXT_WORKSPACES).find((contract) => contract.goal === goal);
}
export function nextContractForExercise(id, template) {
  const old = Object.hasOwn(NEXT_WORKSPACES, id) ? NEXT_WORKSPACES[id] : undefined;
  if (template === undefined) return old;
  const selected = nextTemplate(template);
  return selected && (!old || old.goal === template) ? selected : undefined;
}
export function createNextWorkspaceRegistry(input) {
  const exact = (value, keys) =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
  if (
    !exact(input, ['schemaVersion', 'mode', 'workspaces']) ||
    input.schemaVersion !== 1 ||
    !['compiled', 'bootstrap-legacy'].includes(input.mode) ||
    !Array.isArray(input.workspaces)
  )
    throw Error('Invalid Native catalog');
  if (input.mode === 'bootstrap-legacy' && input.workspaces.length)
    throw Error('Bootstrap cannot declare new workspaces');
  const mode = input.mode;
  const allowed = new Map(mode === 'bootstrap-legacy' ? Object.entries(NEXT_WORKSPACES) : []);
  const seen = new Set();
  for (const row of input.workspaces) {
    if (
      !exact(row, ['id', 'courseId', 'template']) ||
      typeof row.id !== 'string' ||
      row.id.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(row.id) ||
      typeof row.courseId !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(row.courseId) ||
      seen.has(row.id)
    )
      throw Error('Invalid or duplicate Native declaration');
    const old = Object.hasOwn(NEXT_WORKSPACES, row.id) ? NEXT_WORKSPACES[row.id] : undefined;
    const contract = nextTemplate(row.template);
    if (!contract || (old && (old.goal !== row.template || row.courseId !== 'next')))
      throw Error('Unknown or rebound Native execution contract');
    seen.add(row.id);
    allowed.set(row.id, contract);
  }
  return Object.freeze({
    mode,
    get: (id) => allowed.get(id),
    register: (id, template) => {
      const existing = allowed.get(id);
      if (existing) {
        if (existing.goal !== template) throw Error('Native contract cannot be rebound');
        return existing;
      }
      if (
        mode !== 'bootstrap-legacy' ||
        typeof id !== 'string' ||
        id.length > 64 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) ||
        !nextTemplate(template)
      )
        throw Error('Workspace is not declared by the trusted compiler catalog');
      const contract = nextTemplate(template);
      allowed.set(id, contract);
      return contract;
    },
  });
}
if (
  globalThis.process?.env?.TSUMUCODE_REQUIRE_COMPILED_NATIVE_CATALOG === '1' &&
  catalog.mode !== 'compiled'
)
  throw Error('Runtime image requires a compiled Native catalog');
const registry = createNextWorkspaceRegistry(catalog);
export function registerBrowserNextWorkspace(id, template) {
  return registry.register(id, template);
}
export function nextWorkspace(id) {
  return registry.get(id);
}
export function workspaceProfile(id) {
  return nextWorkspace(id) ? NEXT_PROFILE : 'vite-project-v1';
}
