import type { FileHandle } from 'node:fs/promises';

export function readMountInfoBounded(handle: FileHandle): Promise<string>;
export function validatedReadonlyGitObjects(workspace: string, mountinfo: string): Promise<string>;
