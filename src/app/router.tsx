/** Browser Hash historyを所有するRouter factory module。呼出側がdispose責任を持つ。 */
import { createHashRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import {
  completionLoader,
  courseLoader,
  exerciseLoader,
  homeLoader,
  reviewLoader,
  slideLoader,
} from './contentLoaders';
import { CourseMapPage } from '@/features/course/CourseMapPage';
import { ContentErrorPage } from '@/features/home/ContentErrorPage';
import { ContentLoadingPage } from '@/features/home/ContentLoadingPage';
import { HomePage } from '@/features/home/HomePage';
import { ExercisePage } from '@/features/learning/pages/ExercisePage';
import { SlidePage } from '@/features/learning/pages/SlidePage';

/** GitHub PagesでReload可能なTsumuCode Hash Routerを生成する。 */
export function createAppRouter(): ReturnType<typeof createHashRouter> {
  return createHashRouter([
    {
      path: '/',
      element: <AppShell />,
      errorElement: <ContentErrorPage />,
      children: [
        {
          index: true,
          loader: homeLoader,
          HydrateFallback: ContentLoadingPage,
          element: <HomePage />,
        },
        {
          path: '/courses/:courseId',
          loader: courseLoader,
          HydrateFallback: ContentLoadingPage,
          element: <CourseMapPage />,
        },
        {
          path: '/courses/:courseId/lessons/:lessonId/slides/:slideId',
          loader: slideLoader,
          HydrateFallback: ContentLoadingPage,
          element: <SlidePage />,
        },
        {
          path: '/courses/:courseId/lessons/:lessonId/exercises/:exerciseId',
          loader: exerciseLoader,
          HydrateFallback: ContentLoadingPage,
          element: <ExercisePage />,
        },
        {
          path: '/courses/:courseId/lessons/:lessonId/exercises/:exerciseId/review/:slideId',
          loader: reviewLoader,
          HydrateFallback: ContentLoadingPage,
          lazy: async () => ({
            Component: (await import('../features/learning/pages/ReviewPage')).ReviewPage,
          }),
        },
        {
          path: '/courses/:courseId/lessons/:lessonId/exercises/:exerciseId/completion',
          loader: completionLoader,
          HydrateFallback: ContentLoadingPage,
          lazy: async () => ({
            Component: (await import('../features/learning/pages/CompletionPage')).CompletionPage,
          }),
        },
      ],
    },
  ]);
}
