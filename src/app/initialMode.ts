export type InitialAppMode = 'library' | 'normal-learning';

/** 初期HashがLibrary rootまたは子Routeかを境界一致で判定する。 */
export function resolveInitialAppMode(hash: string): InitialAppMode {
  return /^#\/library(?:\/|$)/u.test(hash) ? 'library' : 'normal-learning';
}
