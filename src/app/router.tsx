/** Browser Hash historyを所有するRouter factory module。呼出側がdispose責任を持つ。 */
import { createHashRouter, type RouteObject } from 'react-router-dom';
import { ContentErrorPage } from '@/features/home/ContentErrorPage';
import { ContentLoadingPage } from '@/features/home/ContentLoadingPage';
import type { LibraryRouteModules } from './libraryRouteModules';
import type { NormalLearningRouteModules } from './normalLearningRouteModules';

export interface AppRouterOptions {
  readonly library?: LibraryRouteModules;
  readonly normalLearning?: NormalLearningRouteModules;
}

type RouteModuleFields = Pick<RouteObject, 'Component' | 'lazy' | 'loader'>;

/** 通常学習からLibraryへ移る場合だけ、進捗非干渉Route群を遅延読込する。 */
function loadLibraryRouteModules() {
  return import('./libraryRouteModules');
}

/** Libraryから通常学習へ戻る場合だけ、進捗Runtimeを含むRoute群を遅延読込する。 */
function loadNormalLearningRouteModules() {
  return import('./normalLearningRouteModules');
}

/** 解決済み通常学習moduleを同期Routeにし、未解決時だけlazy Routeを返す。 */
function normalLearningRoute(
  options: AppRouterOptions,
  key: keyof NormalLearningRouteModules,
): RouteModuleFields {
  const resolved = options.normalLearning?.[key];
  if (resolved !== undefined) return resolved;
  return {
    lazy: async () => (await loadNormalLearningRouteModules()).normalLearningRouteModules[key],
  };
}

/** 解決済みLibrary moduleを同期Routeにし、未解決時だけlazy Routeを返す。 */
function libraryRoute(
  options: AppRouterOptions,
  key: keyof LibraryRouteModules,
): RouteModuleFields {
  const resolved = options.library?.[key];
  if (resolved !== undefined) return resolved;
  return {
    lazy: async () => (await loadLibraryRouteModules()).libraryRouteModules[key],
  };
}

/** Lazy Shellの短い読込時間も空白にせず、教材Loaderの詳細表示とは分離する。 */
function renderRouterShellLoadingPage() {
  return (
    <main
      id="main-content"
      className="tc-content-frame mx-auto grid min-h-dvh w-full max-w-[var(--tc-content-max)] place-items-center"
    >
      <p role="status" className="font-bold text-workshop-muted">
        学習工房の入口を準備しています。
      </p>
    </main>
  );
}

/** 通常学習の子Routeを、初期modeに応じて同期または遅延moduleから構成する。 */
function normalLearningChildren(options: AppRouterOptions): RouteObject[] {
  return [
    {
      index: true,
      HydrateFallback: ContentLoadingPage,
      ...normalLearningRoute(options, 'home'),
    },
    {
      path: 'courses/:courseId',
      HydrateFallback: ContentLoadingPage,
      ...normalLearningRoute(options, 'course'),
    },
    {
      path: 'courses/:courseId/lessons/:lessonId/slides/:slideId',
      HydrateFallback: ContentLoadingPage,
      ...normalLearningRoute(options, 'slide'),
    },
    {
      path: 'courses/:courseId/lessons/:lessonId/exercises/:exerciseId',
      HydrateFallback: ContentLoadingPage,
      ...normalLearningRoute(options, 'exercise'),
    },
    {
      path: 'courses/:courseId/lessons/:lessonId/exercises/:exerciseId/review/:slideId',
      HydrateFallback: ContentLoadingPage,
      ...normalLearningRoute(options, 'review'),
    },
    {
      path: 'courses/:courseId/lessons/:lessonId/exercises/:exerciseId/completion',
      HydrateFallback: ContentLoadingPage,
      ...normalLearningRoute(options, 'completion'),
    },
  ];
}

/** GitHub PagesでReload可能なTsumuCode Hash Routerを生成する。 */
export function createAppRouter(
  options: AppRouterOptions = {},
): ReturnType<typeof createHashRouter> {
  return createHashRouter([
    {
      path: '/library',
      HydrateFallback: renderRouterShellLoadingPage,
      ...libraryRoute(options, 'shell'),
      errorElement: <ContentErrorPage />,
      children: [
        {
          path: ':courseId',
          children: [
            {
              index: true,
              HydrateFallback: ContentLoadingPage,
              ...libraryRoute(options, 'course'),
            },
            {
              path: 'lessons/:lessonId/slides/:slideId',
              HydrateFallback: ContentLoadingPage,
              ...libraryRoute(options, 'slide'),
            },
          ],
        },
      ],
    },
    {
      path: '/',
      HydrateFallback: renderRouterShellLoadingPage,
      ...normalLearningRoute(options, 'shell'),
      errorElement: <ContentErrorPage />,
      children: normalLearningChildren(options),
    },
  ]);
}
