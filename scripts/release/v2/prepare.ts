import { compileContent } from '../../content/compile';
import { buildInventory } from './inventory';
import { planRelease } from './plan';
import { verifyNativeCatalog } from './nativeCatalog';
import { hashArtifact } from './identity';

/** One sanitized delivery tree owns app input, known-course indexes and every verification suite. */
export async function prepareRelease(sourceRoot: string, outputRoot: string, baseline?: unknown) {
  const compilation = await compileContent({ sourceRoot, outputRoot, checkOnly: false });
  const inventory = buildInventory(compilation.compilations);
  verifyNativeCatalog(inventory, compilation.nativeWorkspaceCatalog);
  return {
    schemaVersion: 1,
    inventory,
    plan: planRelease(inventory, baseline),
    publicContent: await hashArtifact(outputRoot),
  };
}
