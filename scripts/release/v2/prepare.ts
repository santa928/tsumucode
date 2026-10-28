import path from 'node:path';
import { lstat, mkdir, rm } from 'node:fs/promises';
import { compileContent } from '../../content/compile';
import {
  buildSplitContentDelivery,
  writeSplitContentDeliveryTree,
} from '../../content/splitContentDelivery';
import { buildInventory } from './inventory';
import { planRelease } from './plan';

/** Compile the candidate once. Authoring evidence never changes the public projection. */
export async function prepareRelease(
  sourceRoot: string,
  publicOutput: string,
  authoringOutput: string,
  baseline?: unknown,
) {
  const first = path.resolve(publicOutput),
    second = path.resolve(authoringOutput);
  if (
    first === second ||
    first.startsWith(second + path.sep) ||
    second.startsWith(first + path.sep)
  )
    throw new Error('Public and authoring output must be separate');
  const source = path.resolve(sourceRoot);
  if (second.startsWith(source + path.sep) || source.startsWith(second + path.sep))
    throw new Error('Authoring output overlaps source');
  let component = path.parse(second).root;
  for (const part of second.slice(component.length).split(path.sep).filter(Boolean)) {
    component = path.join(component, part);
    try {
      const stats = await lstat(component);
      if (stats.isSymbolicLink()) throw new Error('Authoring output symlink is forbidden');
      if (component === second) throw new Error('Authoring output ownership already exists');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  await mkdir(path.dirname(second), { recursive: true });
  await mkdir(second, { recursive: false });
  try {
    // Public output retains the compiler's atomic staging/lock protocol.
    const compilation = await compileContent({
      sourceRoot,
      outputRoot: publicOutput,
      publication: 'public',
      checkOnly: false,
    });
    const authoring = buildSplitContentDelivery(
      compilation.compilations,
      compilation.learningPaths,
      'authoring',
    );
    // Authoring destination is task-owned staging, never a deployable artifact.
    await writeSplitContentDeliveryTree(authoringOutput, authoring);
    const inventory = buildInventory(compilation.compilations);
    return { schemaVersion: 1, inventory, plan: planRelease(inventory, baseline) };
  } catch (error) {
    await rm(second, { recursive: true, force: true });
    throw error;
  }
}
