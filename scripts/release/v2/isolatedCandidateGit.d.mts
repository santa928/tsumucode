import type { Buffer } from 'node:buffer';

/** Structural observation; caller must independently authenticate Source and live record. */
export function observeIsolatedCandidateGit(
  workspace: string, commit: string, tagOid: string,
): Promise<{ tagBytes: Buffer }>;
/** Source bytes only; does not authenticate commit provenance, runner, or workflow needs. */
export function observeIsolatedCandidateSource(
  workspace: string, commit: string,
): Promise<{ sourceTree: string; caller: Buffer; qualification: Buffer; publication: Buffer; lock: Buffer; dockerfile: Buffer }>;

/** Source plus fixed fixture workflow; neither the source nor its runtime origin is authenticated. */
export function observeIsolatedCandidateSourceWithPythonFixtures(
  workspace: string, commit: string,
): Promise<{ sourceTree: string; caller: Buffer; qualification: Buffer; publication: Buffer; lock: Buffer; dockerfile: Buffer; pythonFixtures: Buffer }>;

/** Compare only fixed content/receipt paths; claimed commits remain unauthenticated. */
export function observeIsolatedMovementSource(
  workspace: string, commit: string, fromCommit: string, kind: 'legacy' | 'continuation',
): Promise<void>;
