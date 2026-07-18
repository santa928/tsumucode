// @vitest-environment node
import { accessSync, constants, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrapperUrl = new URL('../scripts/docker-compose.sh', import.meta.url);

describe('Docker Compose wrapper', () => {
  it('Git common/admin directoryを自動検出してComposeへ渡す', () => {
    const source = readFileSync(wrapperUrl, 'utf8');

    expect(source).toContain('git rev-parse --path-format=absolute --git-common-dir');
    expect(source).toContain('git rev-parse --path-format=absolute --git-dir');
    expect(source).toContain('TSUMUCODE_GIT_COMMON_DIR');
    expect(source).toContain('TSUMUCODE_GIT_ADMIN');
    expect(source).toContain('exec docker compose "$@"');
  });

  it('直接実行できるpermissionを持つ', () => {
    expect(() => {
      accessSync(wrapperUrl, constants.X_OK);
    }).not.toThrow();
  });
});
