/** 通常学習Routeだけが使うShell・Loader・Pageを単一の遅延境界へ集約する。 */
import { AppShell } from './AppShell';
import {
  completionLoader,
  courseLoader,
  exerciseLoader,
  homeLoader,
  learningPathLoader,
  reviewLoader,
  slideLoader,
} from './contentLoaders';
import { CourseMapPage } from '../features/course/CourseMapPage';
import { HomePage } from '../features/home/HomePage';
import { CompletionPage } from '../features/learning/pages/CompletionPage';
import { ExercisePage } from '../features/learning/pages/ExercisePage';
import { ReviewPage } from '../features/learning/pages/ReviewPage';
import { SlidePage } from '../features/learning/pages/SlidePage';
import { LearningPathPage } from '../features/paths/LearningPathPage';

/**
 * React Routerのlazy戻り値を通常学習用の単一chunkから提供する。
 * Library Routeはこのmoduleをimportせず、進捗・永続化Runtimeとの境界を維持する。
 */
export const normalLearningRouteModules = {
  shell: { Component: AppShell },
  home: { loader: homeLoader, Component: HomePage },
  path: { loader: learningPathLoader, Component: LearningPathPage },
  course: { loader: courseLoader, Component: CourseMapPage },
  slide: { loader: slideLoader, Component: SlidePage },
  exercise: { loader: exerciseLoader, Component: ExercisePage },
  review: { loader: reviewLoader, Component: ReviewPage },
  completion: { loader: completionLoader, Component: CompletionPage },
} as const;

export type NormalLearningRouteModules = typeof normalLearningRouteModules;
