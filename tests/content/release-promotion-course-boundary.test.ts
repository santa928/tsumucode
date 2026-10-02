// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPromotionDiff } from '../../scripts/release/verifyReleasePromotion';

const gitState = vi.hoisted(() => ({ changed: [] as string[] }));
vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: async (_file: string, args: string[]) => ({
      stdout: args.includes('--name-only') ? gitState.changed.join('\0') + '\0' : '',
      stderr: '',
    }),
  }),
}));

describe('promotionの選択Course履歴と既存HTML文書契約', () => {
  beforeEach(() => {
    gitState.changed = [];
  });
  it.each([
    'content/html-css/release-history.yaml',
    'tests/fixtures/progress/previous-release-bundle.json',
    'docs/quality/legacy-note.md',
    'docs/superpowers/legacy-note.md',
  ])('HTMLの元許可%sを維持する', async (relative) => {
    gitState.changed = [relative];
    await expect(
      assertPromotionDiff('/synthetic-unit-root', 'a'.repeat(40), 'html-css'),
    ).resolves.toBeUndefined();
  });
  it('HTML promotionへJS履歴変更を混在させない', async () => {
    gitState.changed = ['content/javascript/release-history.yaml'];
    await expect(
      assertPromotionDiff('/synthetic-unit-root', 'a'.repeat(40), 'html-css'),
    ).rejects.toThrow('PromotionにProduct変更');
  });
  it('JSの宣言literal記録を引き続き許可する', async () => {
    gitState.changed = ['docs/quality/javascript-release-checklist.yaml'];
    await expect(
      assertPromotionDiff('/synthetic-unit-root', 'a'.repeat(40), 'javascript', '2026-10-02.99'),
    ).resolves.toBeUndefined();
  });
  it.each(['docs/quality/legacy-note.md', 'content/html-css/release-history.yaml'])(
    'JSへ%sを混在させない',
    async (relative) => {
      gitState.changed = [relative];
      await expect(
        assertPromotionDiff('/synthetic-unit-root', 'a'.repeat(40), 'javascript', '2026-10-02.99'),
      ).rejects.toThrow('PromotionにProduct変更');
    },
  );
});
