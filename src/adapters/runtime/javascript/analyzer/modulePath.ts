const UNSAFE_WORKSPACE_PATH_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

/** JavaScript Workspace内のFileを一意に扱えるcanonical相対pathか確認する。 */
export function isJavaScriptWorkspacePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 256 ||
    value.normalize('NFC') !== value ||
    UNSAFE_WORKSPACE_PATH_CHARACTERS.test(value) ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes(':') ||
    value.includes('%') ||
    !value.endsWith('.js')
  ) {
    return false;
  }
  return value
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** 相対specifierをWorkspace root内のcanonical pathへ解決し、契約外ならundefinedを返す。 */
export function resolveJavaScriptModuleSpecifier(
  fromFile: string,
  specifier: string,
): string | undefined {
  if (
    !isJavaScriptWorkspacePath(fromFile) ||
    (!specifier.startsWith('./') && !specifier.startsWith('../')) ||
    specifier.includes('\\') ||
    specifier.includes('?') ||
    specifier.includes('#') ||
    specifier.includes(':') ||
    specifier.includes('%') ||
    UNSAFE_WORKSPACE_PATH_CHARACTERS.test(specifier)
  ) {
    return undefined;
  }
  const resolved = fromFile.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) return undefined;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  const path = resolved.join('/');
  return isJavaScriptWorkspacePath(path) ? path : undefined;
}
