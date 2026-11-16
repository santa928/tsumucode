export declare function markActiveCaptureBaselinePhase(
  signal: AbortSignal,
  enabled: boolean,
  phase: string,
  state: string,
  write?: (line: string) => unknown,
): void;

export declare function markCaptureBaselinePhase(
  enabled: boolean,
  phase: string,
  state: string,
  write?: (line: string) => unknown,
  resources?: () => { userCPUTime: number; systemCPUTime: number; maxRSS: number },
): void;
