import { PortableSourceExport } from './PortableSourceExport';

/** 対象制作の包装だけを操作時に読み、既存のsnapshotと離脱抑止を共有する。 */
async function loadExporter() {
  const { createPortableTailwindArchive, downloadPortableTailwindArchive } =
    await import('./portableTailwindArchive');
  return (workspaceId: string, files: Readonly<Record<string, string>>) => {
    if (workspaceId !== 'tailwind-ch02-l01-e01') {
      throw new Error('持ち出し未対応の教材です。');
    }
    downloadPortableTailwindArchive(createPortableTailwindArchive(files));
  };
}

/** 固定Vite制作の持ち出しを表示し、保存・進捗への書込みを追加しない。 */
export function PortableTailwindExport(props: {
  readonly workspaceId: string;
  readonly files: Readonly<Record<string, string>>;
  readonly disabled: boolean;
}) {
  return (
    <PortableSourceExport
      {...props}
      loadExporter={loadExporter}
      description="クリック時点のHTML/CSS、固定Vite設定とbuild手順をZIPにします。展開先のREADMEに沿って確認してください。学習の進捗や判定履歴は含みません。"
    />
  );
}
