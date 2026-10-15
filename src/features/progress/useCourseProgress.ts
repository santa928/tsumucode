import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  CourseProgress,
  ExerciseDraft,
  ProgressRepository,
} from '../../core/persistence/contracts';
import { learningRuntimeServices } from '../learning/runtimeServices';

const SAFE_READ_ERROR = 'コース進捗を読み込めませんでした。';
const EMPTY_WORKSPACES: readonly string[] = Object.freeze([]);

export interface CourseProgressPort {
  readonly ready: Promise<void>;
  readonly repository: Pick<ProgressRepository, 'getCourse'> &
    Partial<Pick<ProgressRepository, 'getDraft'>>;
  readonly subscribeData: (listener: () => void) => () => void;
  readonly getDataRevision: () => number;
}

interface ObservableProgressRepository {
  readonly subscribeData?: CourseProgressPort['subscribeData'];
  readonly getDataRevision?: CourseProgressPort['getDataRevision'];
}

type InternalCourseProgressState = (
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
    }
) & { readonly drafts?: ReadonlyMap<string, ExerciseDraft | undefined> };

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

/** Course進捗と指定済みworkspaceのDraftを購読し、読み取りだけで再開情報を更新する。 */
export function useCourseProgress(
  courseId: string,
  port: CourseProgressPort = DEFAULT_PORT,
  workspaceIds: readonly string[] = EMPTY_WORKSPACES,
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
        if (workspaceIds.length > 0 && port.repository.getDraft === undefined)
          throw new Error('Draftの読み取りが利用できません');
        const [progress, savedDrafts] = await Promise.all([
          port.repository.getCourse(courseId),
          Promise.all(workspaceIds.map((id) => port.repository.getDraft!(courseId, id))),
        ]);
        if (generationRef.current !== generation) return;
        setState({
          courseId,
          status: 'ready',
          progress,
          error: undefined,
          ...(workspaceIds.length === 0
            ? {}
            : {
                drafts: new Map(workspaceIds.map((id, index) => [id, savedDrafts[index]])),
              }),
        });
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
  }, [courseId, dataRevision, port, reloadRevision, workspaceIds]);

  if (state.courseId !== courseId) {
    return { status: 'loading', progress: undefined, error: undefined, retry };
  }
  return { ...state, retry };
}
