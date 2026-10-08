/** 閉じたNext profileの公開契約。Sourceの実検査は実行側で行う。 */
export const NEXT_PROFILE: 'next-project-v1';
export const NEXT_WORKSPACE: 'next-ch01-l01-e01';
export const NEXT_STARTER_FILES: Readonly<
  Record<
    'app/layout.tsx' | 'app/page.tsx' | 'app/globals.css' | 'app/api/question/route.ts',
    string
  >
>;
export function workspaceProfile(id: string): 'next-project-v1' | 'vite-project-v1';
export interface NextWorkspaceContract {
  readonly files: Readonly<Record<string, string>>;
  readonly goal: 'page-route-query' | 'nested-dynamic-navigation' | 'server-client-counter';
  readonly pages: readonly string[];
  readonly previewLabels: readonly string[];
}
export const NEXT_WORKSPACES: Readonly<Record<string, NextWorkspaceContract>>;
export function nextWorkspace(id: string): NextWorkspaceContract | undefined;
