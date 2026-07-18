import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CourseProgress, ProgressRepository } from '../../core/persistence/contracts';
import { learningRuntimeServices } from '../learning/runtimeServices';

const SAFE_READ_ERROR = 'コース進捗を読み込めませんでした。';

export interface CourseProgressPort {
  readonly ready: Promise<void>;
  readonly repository: Pick<ProgressRepository, 'getCourse'>;
  readonly subscribeData: (listener: () => void) => () => void;
  readonly getDataRevision: () => number;
}

interface ObservableProgressRepository {
  readonly subscribeData?: CourseProgressPort['subscribeData'];
  readonly getDataRevision?: CourseProgressPort['getDataRevision'];
}

type InternalCourseProgressState =
  | {
      readonly courseId: string;
      readonly status: 'loading';
      readonly progress: undefined;
      readonly error: undefined;
    }
  | {
      readonly courseId: string;
      readonly status: 'ready';
      readonly progress: CourseProgress | undefined;
      readonly error: undefined;
    }
  | {
      readonly courseId: string;
      readonly status: 'error';
      readonly progress: undefined;
      readonly error: string;
    };

type WithRetry<State> = State extends InternalCourseProgressState
  ? Omit<State, 'courseId'> & { readonly retry: () => void }
  : never;

export type CourseProgressState = WithRetry<InternalCourseProgressState>;

/** RuntimeのResilient Repository購読をHook用の注入portへ適合する。 */
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

/** Repository準備後、data revision変更、pageshow、明示retryでCourse進捗を安全に読み直す。 */
export function useCourseProgress(
  courseId: string,
  port: CourseProgressPort = DEFAULT_PORT,
): CourseProgressState {
  const dataRevision = useSyncExternalStore(
    port.subscribeData,
    port.getDataRevision,
    port.getDataRevision,
  );
  const [reloadRevision, setReloadRevision] = useState(0);
  const [state, setState] = useState<InternalCourseProgressState>({
    courseId,
    status: 'loading',
    progress: undefined,
    error: undefined,
  });
  const generationRef = useRef(0);

  const retry = useCallback(() => {
    setState({
      courseId,
      status: 'loading',
      progress: undefined,
      error: undefined,
    });
    setReloadRevision((revision) => revision + 1);
  }, [courseId]);

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

    void (async () => {
      try {
        await port.ready;
        const progress = await port.repository.getCourse(courseId);
        if (generationRef.current !== generation) return;
        setState({ courseId, status: 'ready', progress, error: undefined });
      } catch {
        if (generationRef.current !== generation) return;
        setState({
          courseId,
          status: 'error',
          progress: undefined,
          error: SAFE_READ_ERROR,
        });
      }
    })();

    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [courseId, dataRevision, port, reloadRevision]);

  if (state.courseId !== courseId) {
    return { status: 'loading', progress: undefined, error: undefined, retry };
  }
  return { ...state, retry };
}
