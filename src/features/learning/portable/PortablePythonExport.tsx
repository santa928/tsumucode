import { PortableSourceExport } from './PortableSourceExport';

/** 固定2ファイルの包装を操作時だけ読み込む。 */
async function loadExporter() {
  const { createPortablePythonArchive, downloadPortablePythonArchive } =
    await import('./portablePythonArchive');
  return (id: string, files: Readonly<Record<string, string>>) => {
    downloadPortablePythonArchive(id, createPortablePythonArchive(id, files));
  };
}

export function PortablePythonExport(props: {
  workspaceId: string;
  files: Readonly<Record<string, string>>;
  disabled: boolean;
}) {
  return (
    <PortableSourceExport
      {...props}
      loadExporter={loadExporter}
      description="クリック時点のmain.py・lesson_tools.pyと起動READMEをZIPにします。両ファイルを同じフォルダーへ展開してください。入力・進捗・判定履歴は含みません。"
    />
  );
}
