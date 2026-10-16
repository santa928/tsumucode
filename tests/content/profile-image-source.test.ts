import { beforeAll, describe, expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';
import { HtmlCssValidationRuleDefinitionSchema } from '../../src/core/content/schema';
import type { HtmlCssValidationRuleDefinition } from '../../src/core/content/types';
import { ValidatorRuleEngine } from '../../src/core/validation/validatorRuleEngine';
import { previewSnapshot, validationContext } from '../fixtures/validation';

let rule: HtmlCssValidationRuleDefinition;

beforeAll(async () => {
  const chapter = await loadChapterPackage('content/html-css/chapters/html-css-ch12/chapter.yaml');
  const exercise = chapter.exercises.find(({ id }) => id === 'html-css-ch12-l04-e01')!;
  rule = HtmlCssValidationRuleDefinitionSchema.parse(
    exercise.validationRules.find(({ id }) => id.endsWith('-r06')),
  );
});

/** 実教材の画像Source条件を、描画条件と分離して同じ2幅で評価する。 */
async function grade(source: string) {
  return new ValidatorRuleEngine().validate(
    validationContext({
      exerciseId: 'html-css-ch12-l04-e01',
      rules: [rule],
      files: { 'styles.css': source },
      snapshots: {
        'mobile-390': previewSnapshot({ viewport: { id: 'mobile-390', width: 390, height: 844 } }),
        'desktop-1280': previewSnapshot({
          viewport: { id: 'desktop-1280', width: 1280, height: 720 },
        }),
      },
    }),
  );
}

describe('Profile画像の3宣言', () => {
  it.each([
    '.work-image { width:100%; max-width:100%; height:auto; }',
    '.work-image { height:auto; width:100%; object-fit:cover; max-width:100%; }',
    '.work-image { width:100%; /* 親幅内へ収める */ max-width:100%; height:auto; }',
    '.work-image { width:50%; width:100%; max-width:100%; height:auto; }',
    '.work-image { width:100%; max-width:100%; } .work-image { height:auto; }',
    '.work-image { width:100%!important; width:50%; max-width:100%; height:auto; }',
    '.work-image, .other { width:100.0%; max-width:100%; height:AUTO; }',
  ])('displayや整形・宣言順を要求せず必要な3宣言を認める: %s', async (source) => {
    expect(await grade(source)).toMatchObject({ status: 'pass' });
  });

  it.each([
    '.work-image { max-width:100%; height:auto; }',
    '.work-image { width:100%; height:auto; }',
    '.work-image { width:100%; max-width:100%; }',
    '.work-image { width:50%; max-width:100%; height:auto; }',
    '.work-image { width:100%; max-width:50%; height:auto; }',
    '.work-image { width:100%; max-width:100%; height:100px; }',
    '.other { display:block; width:100%; max-width:100%; height:auto; }',
    '/* .work-image { display:block; width:100%; max-width:100%; height:auto; } */',
    '.other { content:".work-image { display:block; width:100%; max-width:100%; height:auto; }"; }',
    '.work-image { display:block; width:100%; max-width:100%; height:auto; } .work-image { width:50%; }',
    '.work-image { width:50%!important; width:100%; max-width:100%; height:auto; }',
    '@media (min-width:9999px) { .work-image { display:block; width:100%; max-width:100%; height:auto; } }',
    '.parent .work-image { width:100%; max-width:100%; height:auto; }',
    '.work-image { width:100%; max-width:100%; height:auto; ',
  ])('欠落・誤値・適用先違いを見逃さない: %s', async (source) => {
    expect(await grade(source)).toMatchObject({ status: 'incomplete' });
  });
});
