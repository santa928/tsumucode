/** Course route到達時だけ言語固有Runner・Validator・Editorを登録する。 */
import type { CourseIndex } from '../../core/content/types';
import type { RunnerAdapter } from '../../core/runtime/contracts';
import type { RunnerRegistry } from '../../core/runtime/RunnerRegistry';
import type { ValidatorAdapter } from '../../core/validation/contracts';
import { ValidatorRuleEngine } from '../../core/validation/validatorRuleEngine';
import type { ValidatorRegistry } from '../../core/validation/ValidatorRegistry';
import type { EditorLanguageRegistry } from './editor/EditorLanguageRegistry';
import { registerHtmlCssEditorLanguages } from './editor/htmlCssEditorLanguages';

export interface CourseRuntimeServices {
  readonly runnerRegistry: RunnerRegistry;
  readonly validatorRegistry: ValidatorRegistry;
  readonly editorLanguageRegistry: EditorLanguageRegistry;
}

export type CourseRuntimeDescriptor = Pick<CourseIndex, 'id' | 'runnerId' | 'validatorId'>;

export interface CourseRuntimeLoaders {
  loadTypeScriptRunner(): Promise<{ readonly create: () => RunnerAdapter }>;
  loadTypeScriptValidator(): Promise<{ readonly create: () => ValidatorAdapter }>;
  loadTypeScriptEditor(): Promise<{
    readonly register: (registry: EditorLanguageRegistry) => Promise<void>;
  }>;
  loadJavaScriptRunner(): Promise<{ readonly create: () => RunnerAdapter }>;
  loadJavaScriptValidator(): Promise<{ readonly create: () => ValidatorAdapter }>;
  loadJavaScriptEditor(): Promise<{
    readonly register: (registry: EditorLanguageRegistry) => Promise<void>;
  }>;
}

const defaultLoaders: CourseRuntimeLoaders = {
  /** TypeScript実行実装を演習到達時に読み、Compiler Worker自体は初回compileまで生成しない。 */
  async loadTypeScriptRunner() {
    const { TypeScriptRunnerAdapter } =
      await import('../../adapters/runtime/typescript/TypeScriptRunnerAdapter');
    return { create: () => new TypeScriptRunnerAdapter() };
  },
  /** 元TS照合と生成JSの動作採点をTypeScript演習だけへ読み込む。 */
  async loadTypeScriptValidator() {
    const { TypeScriptValidator } =
      await import('../../adapters/validation/typescript/TypeScriptValidator');
    return { create: () => new TypeScriptValidator() };
  },
  /** 型構文のEditor支援をTypeScript演習まで分離する。 */
  async loadTypeScriptEditor() {
    const { registerTypeScriptEditorLanguage } = await import('./editor/typescriptEditorLanguage');
    return { register: registerTypeScriptEditorLanguage };
  },
  /** JavaScript Runner chunkをroute到達まで初期graphから分離する。 */
  async loadJavaScriptRunner() {
    const { JavaScriptRunnerAdapter } = await import('../../adapters/runtime/javascript');
    return { create: () => new JavaScriptRunnerAdapter() };
  },
  /** JavaScript ValidatorとAnalyzer chunkをroute到達まで初期graphから分離する。 */
  async loadJavaScriptValidator() {
    const { JavaScriptValidator } = await import('../../adapters/validation/javascript');
    return { create: () => new JavaScriptValidator() };
  },
  /** JavaScript CodeMirror parserをroute到達まで初期graphから分離する。 */
  async loadJavaScriptEditor() {
    const { registerJavaScriptEditorLanguage } = await import('./editor/javascriptEditorLanguage');
    return { register: registerJavaScriptEditorLanguage };
  },
};

/** Course宣言のRunner／Validator IDが実装と一致することを先に検証する。 */
function assertCourseRuntimeIds(
  course: CourseRuntimeDescriptor,
  expectedRunnerId: string,
  expectedValidatorId: string,
): void {
  if (course.runnerId !== expectedRunnerId || course.validatorId !== expectedValidatorId) {
    throw new Error(`Course runtime IDが一致しません: ${course.id}`);
  }
}

/** 注入可能なloaderから、Service instance単位のsingle-flight準備関数を作る。 */
export function createCourseRuntimeEnsurer(
  loaders: CourseRuntimeLoaders = defaultLoaders,
): (course: CourseRuntimeDescriptor, services: CourseRuntimeServices) => Promise<void> {
  const operations = new WeakMap<CourseRuntimeServices, Map<string, Promise<void>>>();

  /** Course固有moduleを読み込み、既存登録を保ちながら不足分だけを補う。 */
  async function prepare(
    course: CourseRuntimeDescriptor,
    services: CourseRuntimeServices,
  ): Promise<void> {
    switch (course.id) {
      case 'html-css': {
        assertCourseRuntimeIds(course, 'html-css', 'html-css');
        if (!services.runnerRegistry.has('html-css')) {
          throw new Error('HTML/CSS Runnerが登録されていません');
        }
        if (!services.validatorRegistry.has('html-css')) {
          services.validatorRegistry.register('html-css', () => new ValidatorRuleEngine());
        }
        registerHtmlCssEditorLanguages(services.editorLanguageRegistry);
        return;
      }
      case 'javascript': {
        assertCourseRuntimeIds(course, 'javascript', 'javascript');
        const [runner, validator, editor] = await Promise.all([
          loaders.loadJavaScriptRunner(),
          loaders.loadJavaScriptValidator(),
          loaders.loadJavaScriptEditor(),
        ]);
        if (!services.runnerRegistry.has('javascript')) {
          services.runnerRegistry.register('javascript', runner.create);
        }
        if (!services.validatorRegistry.has('javascript')) {
          services.validatorRegistry.register('javascript', validator.create);
        }
        await editor.register(services.editorLanguageRegistry);
        return;
      }
      case 'typescript': {
        assertCourseRuntimeIds(course, 'typescript', 'typescript');
        const [runner, validator, editor] = await Promise.all([
          loaders.loadTypeScriptRunner(),
          loaders.loadTypeScriptValidator(),
          loaders.loadTypeScriptEditor(),
        ]);
        if (!services.runnerRegistry.has('typescript'))
          services.runnerRegistry.register('typescript', runner.create);
        if (!services.validatorRegistry.has('typescript'))
          services.validatorRegistry.register('typescript', validator.create);
        registerHtmlCssEditorLanguages(services.editorLanguageRegistry);
        await editor.register(services.editorLanguageRegistry);
        return;
      }
      default:
        throw new Error(`未対応のCourse runtimeです: ${course.id}`);
    }
  }

  return async (course, services) => {
    const operationKey = JSON.stringify([course.id, course.runnerId, course.validatorId]);
    let byCourse = operations.get(services);
    if (byCourse === undefined) {
      byCourse = new Map();
      operations.set(services, byCourse);
    }
    const current = byCourse.get(operationKey);
    if (current !== undefined) return current;

    const pending = prepare(course, services);
    const recoverable = pending.catch((error: unknown) => {
      if (byCourse.get(operationKey) === recoverable) byCourse.delete(operationKey);
      throw error;
    });
    byCourse.set(operationKey, recoverable);
    return recoverable;
  };
}

export const ensureCourseRuntime = createCourseRuntimeEnsurer();
