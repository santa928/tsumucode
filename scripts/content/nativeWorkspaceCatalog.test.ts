// @vitest-environment node
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { compileCourse } from './compileCourse';
import { buildInventory } from '../release/v2/inventory';
import { verifyNativeCatalog } from '../release/v2/nativeCatalog';
it('compiles a declared new workspace without adding its ID to executable code', async () => {
  const { buildNativeWorkspaceCatalog } = await import('./nativeWorkspaceCatalog');
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-catalog-growth-'));
  try {
    await cp('content/next', path.join(root, 'next'), { recursive: true });
    const file = path.join(
      root,
      'next/chapters/next-ch01/lessons/next-ch01-l01/exercises/next-ch01-l01-e01/exercise.yaml',
    );
    const input: unknown = parse(await readFile(file, 'utf8'));
    const exercise = z
      .object({
        workspaceId: z.string(),
        runtime: z.object({ contract: z.string().optional() }).loose(),
      })
      .loose()
      .parse(input);
    exercise.workspaceId = 'future-topic-workspace';
    exercise.runtime.contract = 'page-route-query';
    await writeFile(file, stringify(exercise));
    const compilation = await compileCourse(path.join(root, 'next'));
    const catalog = buildNativeWorkspaceCatalog([compilation]);
    expect(catalog.mode).toBe('compiled');
    expect(
      catalog.workspaces.some(
        (row) => row.id === 'future-topic-workspace' && row.template === 'page-route-query',
      ),
    ).toBe(true);
    expect(catalog.workspaces.some((row) => row.id === 'next-ch01-l01-e01')).toBe(false);
    const inventory = buildInventory([compilation]);
    expect(verifyNativeCatalog(inventory, catalog).workspaces).toBe(catalog.workspaces.length);
    expect(() =>
      verifyNativeCatalog(inventory, { ...catalog, mode: 'bootstrap-legacy', workspaces: [] }),
    ).toThrow();
    expect(() =>
      verifyNativeCatalog(inventory, { ...catalog, workspaces: catalog.workspaces.slice(1) }),
    ).toThrow();
    expect(() =>
      verifyNativeCatalog(inventory, {
        ...catalog,
        workspaces: [
          ...catalog.workspaces,
          { id: 'undeclared', courseId: 'next', template: 'page-route-query' },
        ],
      }),
    ).toThrow();
    expect(() =>
      verifyNativeCatalog(inventory, {
        ...catalog,
        workspaces: catalog.workspaces.map((row) =>
          row.id === 'future-topic-workspace'
            ? { ...row, template: 'server-action-validation' }
            : row,
        ),
      }),
    ).toThrow();
    expect(() =>
      buildNativeWorkspaceCatalog([
        compilation,
        { ...compilation, runtime: { ...compilation.runtime, id: 'other-course' } },
      ]),
    ).toThrow();

    const protocol = await import('../local/next-project-protocol.mjs');
    const registry = protocol.createNextWorkspaceRegistry(catalog);
    expect(registry.get('future-topic-workspace')).toBeDefined();
    expect(registry.get('undeclared')).toBeUndefined();
    delete exercise.runtime.contract;
    await writeFile(file, stringify(exercise));
    await expect(compileCourse(path.join(root, 'next'))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
