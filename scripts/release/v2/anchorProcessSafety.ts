const requiredGitEnvironment = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_OPTIONAL_LOCKS: '0',
} as const;

/**
 * Defense in depth only: a trusted launcher must sanitize before Node or dependencies start.
 * Checking environment variables here cannot undo a preload that has already executed.
 */
export function assertSafeAnchorEnvironment(environment: NodeJS.ProcessEnv) {
  if (environment.PATH !== '/usr/bin:/bin') throw Error('Unsafe anchor process path');
  for (const [name, value] of Object.entries(requiredGitEnvironment)) {
    if (environment[name] !== value) throw Error('Unsafe anchor Git environment');
  }
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();
    if (upper.startsWith('GIT_')) {
      if (
        !(name in requiredGitEnvironment) ||
        requiredGitEnvironment[name as keyof typeof requiredGitEnvironment] !== value
      )
        throw Error('Unsafe anchor Git environment');
      continue;
    }
    if (upper.startsWith('NODE_')) {
      if (name === 'NODE_ENV' && (value === 'test' || value === 'production')) continue;
      if (name === 'NODE_VERSION' && value === process.versions.node) continue;
      throw Error('Unsafe anchor Node environment');
    }
    if (
      upper.startsWith('NPM_') ||
      upper.startsWith('LD_') ||
      upper.startsWith('DYLD_') ||
      upper === 'BASH_ENV' ||
      upper === 'ENV' ||
      upper === 'PYTHONPATH' ||
      upper === 'PYTHONHOME' ||
      upper === 'PERL5OPT' ||
      upper === 'RUBYOPT' ||
      upper === 'TAR_OPTIONS' ||
      upper.startsWith('SSL_CERT_') ||
      upper === 'CURL_CA_BUNDLE' ||
      upper === 'REQUESTS_CA_BUNDLE' ||
      upper.endsWith('_PROXY') ||
      upper.startsWith('GLOBAL_AGENT_') ||
      upper.includes('TOKEN') ||
      upper.includes('SECRET') ||
      upper.includes('PASSWORD')
    )
      throw Error('Unsafe anchor process environment');
    if ((upper === 'TMPDIR' || upper === 'TMP' || upper === 'TEMP') && value !== '/tmp')
      throw Error('Unsafe anchor temporary directory');
  }
}

/** No caller-supplied Git configuration, executable path, credentials, or repository selectors. */
export function isolatedAnchorGitEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: '/usr/bin:/bin',
    LC_ALL: 'C',
    GIT_CONFIG_GLOBAL: requiredGitEnvironment.GIT_CONFIG_GLOBAL,
    GIT_CONFIG_NOSYSTEM: requiredGitEnvironment.GIT_CONFIG_NOSYSTEM,
    GIT_NO_REPLACE_OBJECTS: requiredGitEnvironment.GIT_NO_REPLACE_OBJECTS,
    GIT_OPTIONAL_LOCKS: requiredGitEnvironment.GIT_OPTIONAL_LOCKS,
    GIT_TERMINAL_PROMPT: '0',
  };
}

/** Git's ordinary status can hide modified files using index flags. */
export function assertVisibleAnchorIndex(output: string) {
  const entries = output.split('\0');
  if (entries.pop() !== '' || entries.some((entry) => !entry.startsWith('H ')))
    throw Error('Unsafe anchor Git index flags');
}
