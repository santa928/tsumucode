import { vi } from 'vitest';

/** Simulate the trusted launcher's clean environment after Vitest itself has started. */
export function installSafeAnchorTestEnvironment() {
  for (const name of Object.keys(process.env)) {
    const upper = name.toUpperCase();
    if (
      upper.startsWith('GIT_') ||
      upper.startsWith('NPM_') ||
      upper.startsWith('LD_') ||
      upper.startsWith('DYLD_') ||
      (upper.startsWith('NODE_') && upper !== 'NODE_ENV' && upper !== 'NODE_VERSION') ||
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
      upper.includes('PASSWORD') ||
      upper === 'TMPDIR' ||
      upper === 'TMP' ||
      upper === 'TEMP'
    )
      vi.stubEnv(name, undefined);
  }
  vi.stubEnv('PATH', '/usr/bin:/bin');
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_NO_REPLACE_OBJECTS', '1');
  vi.stubEnv('GIT_OPTIONAL_LOCKS', '0');
}
