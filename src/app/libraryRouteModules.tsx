/** 進捗非干渉のLibrary Routeだけが使うShell・Loader・Pageを単一境界へ集約する。 */
import { libraryCourseLoader, librarySlideLoader } from './libraryContentLoaders';
import { LibraryIndexPage } from '../features/library/LibraryIndexPage';
import { LibraryShell } from '../features/library/LibraryShell';
import { LibrarySlidePage } from '../features/library/LibrarySlidePage';

/** Library初期entryでは同期利用し、通常学習からの移動時だけ遅延利用するRoute module群。 */
export const libraryRouteModules = {
  shell: { Component: LibraryShell },
  course: { loader: libraryCourseLoader, Component: LibraryIndexPage },
  slide: { loader: librarySlideLoader, Component: LibrarySlidePage },
} as const;

export type LibraryRouteModules = typeof libraryRouteModules;
