import process from 'node:process';

/** Test-owned repositories must not inherit the surrounding read-only worktree selectors. */
export function gitFixtureEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
}
