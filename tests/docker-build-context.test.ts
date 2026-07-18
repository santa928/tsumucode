// @vitest-environment node
/** Docker build contextが再生成物をimmutable image layerへ持ち込まないことを検証する。 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../', import.meta.url);

/** .dockerignoreの有効なpatternを空白・commentを除いて返す。 */
function readDockerIgnorePatterns(): readonly string[] {
  return readFileSync(new URL('.dockerignore', projectRoot), 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

describe('Docker build context', () => {
  it('Content Compilerの生成先をimage layerへ固定しない', () => {
    expect(readDockerIgnorePatterns()).toContain('public/generated/content');
  });
});
