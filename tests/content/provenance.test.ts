import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProvenance } from '../../scripts/content/checkProvenance';

/** Provenance checkerのfailure fixture rootを返す。 */
async function fixtureRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'tsumucode-provenance-'));
}

describe('checkProvenance', () => {
  it('JavaScriptなどのコード教材Fileも未登録なら報告する', async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, 'solution.js'), 'console.log("answer");\n', 'utf8');
    await writeFile(
      path.join(root, 'provenance.yaml'),
      [
        'schemaVersion: 1',
        'defaults:',
        '  method: original-authored',
        "  createdAt: '2026-07-16'",
        '  creator: TsumuCode project',
        '  sourceUrl: none',
        '  license: project-original',
        '  modified: false',
        'items: []',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(checkProvenance(root, path.join(root, 'provenance.yaml'))).rejects.toThrow(
      'solution.js',
    );
  });

  it('manifestにない教材Fileを報告する', async () => {
    const root = await fixtureRoot();
    await mkdir(path.join(root, 'slides'), { recursive: true });
    await writeFile(path.join(root, 'slides', 'intro.md'), '# はじめの一歩\n', 'utf8');
    await writeFile(
      path.join(root, 'provenance.yaml'),
      [
        'schemaVersion: 1',
        'defaults:',
        '  method: original-authored',
        "  createdAt: '2026-07-16'",
        '  creator: TsumuCode project',
        '  sourceUrl: none',
        '  license: project-original',
        '  modified: false',
        'items: []',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(checkProvenance(root, path.join(root, 'provenance.yaml'))).rejects.toThrow(
      'slides/intro.md',
    );
  });

  it('Progate由来URLを拒否する', async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, 'slide.md'), '# 独自教材\n', 'utf8');
    await writeFile(
      path.join(root, 'provenance.yaml'),
      [
        'schemaVersion: 1',
        'defaults:',
        '  method: original-authored',
        "  createdAt: '2026-07-16'",
        '  creator: TsumuCode project',
        '  sourceUrl: none',
        '  license: project-original',
        '  modified: false',
        'items:',
        '  - id: slide',
        '    visibility: public',
        '    path: slide.md',
        '    sourceUrl: https://prog-8.com/courses/html',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(checkProvenance(root, path.join(root, 'provenance.yaml'))).rejects.toThrow(
      '禁止Domain',
    );
  });

  it('solutionとfixtureをpublicへ分類すると拒否する', async () => {
    const root = await fixtureRoot();
    await mkdir(path.join(root, 'exercise', 'solution'), { recursive: true });
    await writeFile(path.join(root, 'exercise', 'solution', 'index.html'), '<h1>答え</h1>', 'utf8');
    await writeFile(
      path.join(root, 'provenance.yaml'),
      [
        'schemaVersion: 1',
        'defaults:',
        '  method: original-authored',
        "  createdAt: '2026-07-16'",
        '  creator: TsumuCode project',
        '  sourceUrl: none',
        '  license: project-original',
        '  modified: false',
        'items:',
        '  - id: leaked-answer',
        '    visibility: public',
        '    path: exercise/solution/index.html',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(checkProvenance(root, path.join(root, 'provenance.yaml'))).rejects.toThrow(
      'authoring',
    );
  });

  it('image-generationへpromptPathがなければ拒否する', async () => {
    const root = await fixtureRoot();
    await writeFile(path.join(root, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(
      path.join(root, 'provenance.yaml'),
      [
        'schemaVersion: 1',
        'defaults:',
        '  method: original-authored',
        "  createdAt: '2026-07-16'",
        '  creator: TsumuCode project',
        '  sourceUrl: none',
        '  license: project-original',
        '  modified: false',
        'items:',
        '  - id: generated-image',
        '    visibility: public',
        '    path: image.svg',
        '    method: image-generation',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(checkProvenance(root, path.join(root, 'provenance.yaml'))).rejects.toThrow(
      'promptPath',
    );
  });
});
