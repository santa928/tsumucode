/** Library初期表示を進捗非干渉の同期Routeだけで開始する。 */
import { libraryRouteModules } from './libraryRouteModules';
import { mountApp } from './mountApp';
import { createAppRouter } from './router';

mountApp(createAppRouter({ library: libraryRouteModules }));
