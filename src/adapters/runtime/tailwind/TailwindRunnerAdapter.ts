import { HtmlCssRunnerAdapter } from '../html-css/HtmlCssRunnerAdapter';
import { createTailwindCompilerLoader } from './compilerAsset';
import { createTailwindSrcdoc } from './createTailwindSrcdoc';
import {
  getTailwindProjectCss,
  TailwindSourceError,
  validateTailwindSource,
} from './validateSource';
import type { RunnerInput, RunnerRenderResult } from '../../../core/runtime/contracts';
import { TailwindExerciseRuntimeSchema } from '../../../core/content/schema';

/** compiler取得を初回renderへ遅延し、既存の取消・旧Preview復旧契約を共有する。 */
export class TailwindRunnerAdapter extends HtmlCssRunnerAdapter {
  /** compiler取得をrenderへ遅延し、未対応入力だけを日本語診断へ変換する。 */
  constructor() {
    const loadCompiler = createTailwindCompilerLoader();
    super({
      languageId: 'tailwind',
      /** 入力制限の違反を実行環境の障害と区別して返す。 */
      validateSource(input, original) {
        try {
          return validateTailwindSource(input, original);
        } catch (error) {
          if (!(error instanceof TailwindSourceError)) throw error;
          return [
            {
              code: 'TAILWIND_INPUT_UNSUPPORTED',
              kind: 'syntax',
              severity: 'error',
              message: error.message,
              learnerMessage: `${error.message} 編集内容は残っています。`,
              file: error.file,
            },
          ];
        }
      },
      /** 固定compilerを照合し、取消後着を拒否してsrcdocへ埋め込む。 */
      async createSrcdoc(input, signal, original) {
        const projectCss = getTailwindProjectCss(original);
        const compiler = await loadCompiler(signal);
        signal.throwIfAborted();
        return createTailwindSrcdoc(input, compiler, projectCss);
      },
    });
  }

  /** 完全検証した固定importはcompiler内部で解決するため、その除去警告だけを除く。 */
  override async render(input: RunnerInput): Promise<RunnerRenderResult> {
    const project = TailwindExerciseRuntimeSchema.safeParse(input.options['runtime']).success;
    const result = await super.render(input);
    if (!project) return result;
    return {
      ...result,
      diagnostics: result.diagnostics.filter(
        (diagnostic) => diagnostic.code !== 'CSS_IMPORT_REMOVED',
      ),
    };
  }
}
