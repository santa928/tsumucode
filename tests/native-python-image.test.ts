// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const dockerfile = readFileSync('Dockerfile.learning', 'utf8');
describe('Python fixture evidence remains in the trusted verifier image', () => {
  it('includes its actual helper and compiler/schema dependency closure', () => {
    const stage = dockerfile.split('AS python-browser-checks\n')[1]!.split('\nFROM ')[0]!;
    for (const source of [
      'node_modules/zod',
      'tests/e2e/helpers/pythonFixtureCoverage.ts',
      'scripts/content',
      'scripts/release/v2',
      'src/core/content',
      'src/core/persistence/canonicalJson.ts',
      'src/shared/lib/resolvePublicAsset.ts',
    ])
      expect(stage).toContain(source);
  });
  it('keeps fixture/compiler metadata out of learner, controller and web images', () => {
    for (const name of ['project', 'controller', 'web']) {
      const stage = dockerfile.split('AS ' + name + '\n')[1]!.split('\nFROM ')[0]!;
      expect(stage).not.toContain('pythonFixtureCoverage');
      expect(stage).not.toContain('COPY scripts/content ');
      expect(stage).not.toContain('COPY scripts/release/v2 ');
    }
  });
});
