import { HtmlCssRunnerAdapter } from '../html-css/HtmlCssRunnerAdapter';
import { createTailwindCompilerLoader } from './compilerAsset';
import { createTailwindSrcdoc } from './createTailwindSrcdoc';
import { TailwindSourceError, validateTailwindSource } from './validateSource';

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
              file: 'index.html',
            },
          ];
        }
      },
      /** 固定compilerを照合し、取消後着を拒否してsrcdocへ埋め込む。 */
      async createSrcdoc(input, signal) {
        const compiler = await loadCompiler(signal);
        signal.throwIfAborted();
        return createTailwindSrcdoc(input, compiler);
      },
    });
  }
}
