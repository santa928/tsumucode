import path from 'node:path';
import { lstat, mkdir, rm, cp } from 'node:fs/promises';
import { compileContent } from '../../content/compile';
import {
  buildSplitContentDelivery,
  writeSplitContentDeliveryTree,
} from '../../content/splitContentDelivery';
import { buildInventory } from './inventory';
import { planRelease } from './plan';
import { hashArtifact } from './identity';

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

/** Reuse app bytes for authoring checks; the deployable tree is never modified or rebuilt. */
export async function createAuthoringPreview(root: string) {
  const parent = path.resolve(root, '.release-v2');
  const metadata = await lstat(parent);
  if (metadata.isSymbolicLink() || !metadata.isDirectory())
    throw new Error('Authoring staging must be an owned directory');
  const source = path.resolve(root, 'dist'),
    data = path.join(parent, 'authoring-public');
  const publicIdentity = await hashArtifact(source);
  const authoringIdentity = await hashArtifact(data);
  if (authoringIdentity.files.some((file) => !file.path.startsWith('generated/content/')))
    throw new Error('Unexpected authoring data path');
  const target = path.join(parent, 'authoring-dist');
  await mkdir(target, { recursive: false });
  try {
    await cp(source, target, { recursive: true, errorOnExist: false, force: false });
    const projection = path.join(target, 'generated/content');
    await rm(projection, { recursive: true, force: true });
    await cp(path.join(data, 'generated/content'), projection, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    if ((await hashArtifact(source)).digest !== publicIdentity.digest)
      throw new Error('Public artifact changed while preparing authoring preview');
    const observed = await hashArtifact(target);
    const expected = new Map(
      [
        ...publicIdentity.files.filter((file) => !file.path.startsWith('generated/content/')),
        ...authoringIdentity.files,
      ].map((file) => [file.path, file]),
    );
    if (
      observed.files.length !== expected.size ||
      observed.files.some((file) => {
        const original = expected.get(file.path);
        return !original || original.bytes !== file.bytes || original.sha256 !== file.sha256;
      })
    )
      throw new Error('Authoring preview differs from the same app build');
    return {
      publicDigest: publicIdentity.digest,
      authoringDigest: observed.digest,
    };
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
