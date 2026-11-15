import type { ChildProcess } from 'node:child_process';
export function markProbeStage(stage: string): void;
export function markOnSpawn(child: ChildProcess, mark?: (stage: string) => void): void;
export function writeStage(dir: string, stage: string): Promise<boolean>;
export function readStages(dir: string): Record<string, 'reached' | 'unknown'>;
