/** 複数Courseの端末進捗を購読し、書込みなしでLearningPath summaryを返す。 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CourseCatalogEntry, LearningPathDefinition } from '../../core/content/types';
import type { CourseProgress, ProgressRepository } from '../../core/persistence/contracts';
import { learningRuntimeServices } from '../learning/runtimeServices';
import {
  summarizeLearningPathProgress,
  type LearningPathProgressSummary,
} from './learningPathProgress';
import type { CourseProgressPort } from './useCourseProgress';

const SAFE_READ_ERROR = '学習パスの進捗を読み込めませんでした。';
const COURSE_ID_SEPARATOR = '\u0000';

interface ObservableProgressRepository {
  readonly subscribeData?: CourseProgressPort['subscribeData'];
  readonly getDataRevision?: CourseProgressPort['getDataRevision'];
}

type InternalLearningPathProgressState =
  | {
      readonly dependencyKey: string;
      readonly status: 'loading';
      readonly progressByCourseId: undefined;
      readonly error: undefined;
    }
  | {
      readonly dependencyKey: string;
      readonly status: 'ready';
      readonly progressByCourseId: ReadonlyMap<string, CourseProgress | undefined>;
      readonly error: undefined;
    }
  | {
      readonly dependencyKey: string;
      readonly status: 'error';
      readonly progressByCourseId: undefined;
      readonly error: string;
    };

export interface LearningPathProgressState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly summary?: LearningPathProgressSummary;
  readonly error?: string;
  readonly retry: () => void;
}

/** RuntimeのResilient Repository購読を複数Course読取用portへ適合する。 */
const DEFAULT_PORT: CourseProgressPort = {
  get ready() {
    return learningRuntimeServices.ready;
  },
  get repository() {
    return learningRuntimeServices.repository;
  },
  subscribeData(listener) {
    const repository = learningRuntimeServices.repository as ProgressRepository &
      ObservableProgressRepository;
    return (
      repository.subscribeData?.(listener) ??
      (() => {
        return undefined;
      })
    );
  },
  getDataRevision() {
    const repository = learningRuntimeServices.repository as ProgressRepository &
      ObservableProgressRepository;
    return repository.getDataRevision?.() ?? 0;
  },
};

/**
 * Path StepのCourse IDを重複なく読み、通知・pageshow・retryで全対象を再取得する。
 * 保存APIをportへ要求せず、Path summaryは最新metadataと読取結果から毎render導出する。
 */
export function useLearningPathProgress(
  path: LearningPathDefinition,
  courses: readonly CourseCatalogEntry[],
  port: CourseProgressPort = DEFAULT_PORT,
): LearningPathProgressState {
  const dependencyKey = [...new Set(path.steps.map(({ courseId }) => courseId))].join(
    COURSE_ID_SEPARATOR,
  );
  const dataRevision = useSyncExternalStore(
    port.subscribeData,
    port.getDataRevision,
    port.getDataRevision,
  );
  const [reloadRevision, setReloadRevision] = useState(0);
  const [state, setState] = useState<InternalLearningPathProgressState>({
    dependencyKey,
    status: 'loading',
    progressByCourseId: undefined,
    error: undefined,
  });
  const generationRef = useRef(0);

  const retry = useCallback(() => {
    setState({
      dependencyKey,
      status: 'loading',
      progressByCourseId: undefined,
      error: undefined,
    });
    setReloadRevision((revision) => revision + 1);
  }, [dependencyKey]);

  useEffect(() => {
    const onPageShow = () => {
      setReloadRevision((revision) => revision + 1);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const courseIds = dependencyKey === '' ? [] : dependencyKey.split(COURSE_ID_SEPARATOR);

    void (async () => {
      try {
        await port.ready;
        const entries = await Promise.all(
          courseIds.map(
            async (courseId) => [courseId, await port.repository.getCourse(courseId)] as const,
          ),
        );
        if (generationRef.current !== generation) return;
        setState({
          dependencyKey,
          status: 'ready',
          progressByCourseId: new Map(entries),
          error: undefined,
        });
      } catch {
        if (generationRef.current !== generation) return;
        setState({
          dependencyKey,
          status: 'error',
          progressByCourseId: undefined,
          error: SAFE_READ_ERROR,
        });
      }
    })();

    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [dataRevision, dependencyKey, port, reloadRevision]);

  if (state.dependencyKey !== dependencyKey || state.status === 'loading') {
    return { status: 'loading', retry };
  }
  if (state.status === 'error') {
    return { status: 'error', error: state.error, retry };
  }
  return {
    status: 'ready',
    summary: summarizeLearningPathProgress(path, courses, state.progressByCourseId),
    retry,
  };
}
