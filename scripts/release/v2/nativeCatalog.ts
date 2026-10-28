import { lstat, readFile } from 'node:fs/promises';
import {
  nextContractForExercise,
  createNextWorkspaceRegistry,
  type CompiledNativeCatalog,
} from '../../local/next-project-protocol.mjs';
import { InventorySchema } from './schema';
import { hashValue } from './identity';

/** Reconstruct the exact image allowlist from the frozen compiler inventory. */
export function nativeCatalogFromInventory(input: unknown): CompiledNativeCatalog {
  const inventory = InventorySchema.parse(input);
  const rows = new Map<string, CompiledNativeCatalog['workspaces'][number]>();
  for (const course of inventory.courses) {
    for (const lesson of course.lessons) {
      for (const exercise of lesson.exercises) {
        if (exercise.runtimeKind !== 'next') {
          if (exercise.nativeTemplate !== undefined)
            throw Error('Native template on another runtime');
          continue;
        }
        const contract = nextContractForExercise(exercise.workspaceId, exercise.nativeTemplate);
        if (!contract || exercise.profile !== 'next-project-v1')
          throw Error('Unknown Native execution contract in inventory');
        const row = { id: exercise.workspaceId, courseId: course.id, template: contract.goal };
        const existing = rows.get(row.id);
        if (existing && hashValue(existing) !== hashValue(row))
          throw Error('Conflicting Native workspace ownership');
        rows.set(row.id, row);
      }
    }
  }
  const catalog: CompiledNativeCatalog = {
    schemaVersion: 1,
    mode: 'compiled',
    workspaces: [...rows.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  createNextWorkspaceRegistry(catalog);
  return catalog;
}
export function verifyNativeCatalog(inventory: unknown, observed: unknown) {
  const expected = nativeCatalogFromInventory(inventory);
  const registry = createNextWorkspaceRegistry(observed);
  if (registry.mode !== 'compiled' || hashValue(expected) !== hashValue(observed))
    throw Error('Native image catalog differs from the same-source compiler inventory');
  return {
    schemaVersion: 1,
    catalogDigest: hashValue(expected),
    workspaces: expected.workspaces.length,
  };
}
export async function verifyNativeCatalogFile(inventory: unknown, file: string) {
  const stats = await lstat(file);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 1024 * 1024)
    throw Error('Invalid Native catalog file');
  return verifyNativeCatalog(inventory, JSON.parse(await readFile(file, 'utf8')) as unknown);
}
