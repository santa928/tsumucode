import { PortableSourceExport } from './PortableSourceExport';

/** 固定Next制作教材の包装を操作時だけ読み込む。 */
async function loadExporter() {
  const { createPortableNextArchive, downloadPortableNextArchive } =
    await import('./portableNextArchive');
  return (id: string, files: Readonly<Record<string, string>>) => {
    downloadPortableNextArchive(id, createPortableNextArchive(id, files));
  };
}

export function PortableNextExport(props: {
  workspaceId: string;
  files: Readonly<Record<string, string>>;
  disabled: boolean;
}) {
  return (
    <PortableSourceExport
      {...props}
      loadExporter={loadExporter}
      description="クリック時点の制作Source、画像、固定依存と起動手順をZIPにします。展開後はREADMEに沿って起動してください。学習の進捗や判定履歴は含みません。"
    />
  );
}
