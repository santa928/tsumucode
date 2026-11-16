export function assertCandidateContentSource(
  root: string,
  source: string,
  environment: NodeJS.ProcessEnv,
): Promise<void>;
export function resolveCandidateSource(environment: NodeJS.ProcessEnv, localHead: () => string): string;
