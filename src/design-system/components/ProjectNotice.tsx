/** 公開範囲と非提携関係を全Routeで同じ文言に固定する。 */
export function ProjectNotice() {
  return (
    <p className="max-w-[var(--tc-content-reading)] text-sm text-workshop-muted">
      TsumuCodeは個人・身内向けに制作した非商用の独立学習サイトです。Progateとは提携・関連していません。教材・課題・UIは独自制作です。
    </p>
  );
}
