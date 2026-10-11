import { strToU8, zipSync } from 'fflate';
import {
  PYTHON_LESSONS,
  isPythonModuleProfile,
  validPythonFiles,
} from '../../../core/runtime/pythonLessonProfiles.mjs';
import { downloadArchive } from './downloadArchive';

/** 固定2.pyと手順だけを包装し、入力や進捗・実行identityを受け取らない。 */
export function createPortablePythonArchive(
  workspaceId: string,
  files: Readonly<Record<string, string>>,
): Uint8Array<ArrayBuffer> {
  const lesson = PYTHON_LESSONS[workspaceId];
  if (!lesson || !isPythonModuleProfile(lesson.profile))
    throw new Error('持ち出し未対応の教材です。');
  if (!validPythonFiles(files, lesson.profile))
    throw new Error('固定2ファイルをそろえ、Source合計100 KiB以内にしてください。');
  const readme = `# TsumuCode Python教材のSource

main.pyとlesson_tools.pyを同じフォルダーへ展開してください。
既にPythonを使える環境で python main.py を実行します。
Module教材は8、10を表示します。例外教材は整数の文字列を1行、制作教材は2行、順番に入力します。
制作では3と5なら8、abc等なら「整数を入力してください」、最後に「終了」を表示する課題です。
サイト内の実行環境はCPython 3.14.2 / Pyodide 314.0.7です。
サイト外のPython環境の権限・上限はサイト内の隔離とは異なります。package追加は不要です。
このZIPはクリック時点のSourceです。入力・token・進捗・判定履歴は含みません。
`;
  return new Uint8Array(
    zipSync(
      {
        'main.py': strToU8(files['main.py']!),
        'lesson_tools.py': strToU8(files['lesson_tools.py']!),
        'README.md': strToU8(readme),
      },
      { level: 0 },
    ),
  );
}

/** 固定教材IDからだけDownload名を決める。 */
export function downloadPortablePythonArchive(
  workspaceId: string,
  archive: Uint8Array<ArrayBuffer>,
): void {
  const lesson = PYTHON_LESSONS[workspaceId];
  if (!lesson || !isPythonModuleProfile(lesson.profile))
    throw new Error('持ち出し未対応の教材です。');
  downloadArchive(archive, `tsumucode-${workspaceId}.zip`);
}
