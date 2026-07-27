/** 通常学習初期表示を同期Routeで開始し、主要描画のFallback差し替えを避ける。 */
import { mountApp } from './mountApp';
import { normalLearningRouteModules } from './normalLearningRouteModules';
import { createAppRouter } from './router';

mountApp(createAppRouter({ normalLearning: normalLearningRouteModules }));
