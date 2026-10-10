// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkStaticArtifact } from '../../scripts/release/checkStaticArtifact';
import { compileCourse } from '../../scripts/content/compileCourse';
import {
  buildSplitContentDelivery,
  writeSplitContentDeliveryTree,
} from '../../scripts/content/splitContentDelivery';
import { resolveReleaseCourseContract } from '../../scripts/release/releaseCourseContracts';
import { nextWorkspace } from '../../scripts/local/next-project-protocol.mjs';
import packaging from '../../scripts/local/next-portable-packaging.json';

const temporaryRoots: string[] = [];

/** 実TS教材を公開用に分割し、既存の必須HTML Artifactと合わせる。 */
async function typescriptArtifact(): Promise<string> {
  const root = await artifact('extra.json', '{}');
  const compilation = await compileCourse('content/typescript');
  await writeSplitContentDeliveryTree(
    path.join(root, 'generated/content'),
    buildSplitContentDelivery([compilation], []),
  );
  return root;
}

/** 最小の正常Artifactへ検査対象Fileを1件加える。 */
async function artifact(extraName: string, extraContent: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-artifact-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'generated/content/courses/html-css/lessons'), { recursive: true });
  await mkdir(path.join(root, 'assets'));
  await writeFile(
    path.join(root, 'index.html'),
    '<script src="/repository-name/assets/app.js"></script>',
  );
  await writeFile(path.join(root, 'assets/app.js'), 'safe application');
  await writeFile(path.join(root, 'generated/content/catalog-v3.json'), '{}');
  await writeFile(path.join(root, 'generated/content/courses/html-css/index.json'), '{}');
  await writeFile(
    path.join(root, 'generated/content/courses/html-css/lessons/lesson-first.json'),
    '{}',
  );
  await writeFile(path.join(root, extraName), extraContent);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('static artifact', () => {
  it('Nextの固定SourceとZIP READMEだけを表示dataとして受理する', async () => {
    const source = nextWorkspace('next-ch03-l01-e01')!.files['app/data-url.ts'];
    if (source === undefined) throw new Error('固定Next Sourceがありません');
    const root = await artifact(
      'assets/next-project-protocol-reviewed.js',
      `const files = { 'app/data-url.ts': ${JSON.stringify(source)} };`,
    );
    await writeFile(
      path.join(root, 'assets/portableNextArchive-reviewed.js'),
      `const packaging = { 'README.md': ${JSON.stringify(packaging['README.md'])} };`,
    );
    await expect(checkStaticArtifact(root)).resolves.toEqual({ files: 7 });
  });

  it.each(['改変Source', '他chunk', '通信URL追加', '直接引数', 'template補間'])(
    'Nextの表示dataの許可を%sへ拡大しない',
    async (kind) => {
      const source = nextWorkspace('next-ch03-l01-e01')!.files['app/data-url.ts'];
      if (source === undefined) throw new Error('固定Next Sourceがありません');
      let content = `const files = { 'app/data-url.ts': ${JSON.stringify(source)} };`;
      if (kind === '改変Source') content = content.replace('5174', '5175');
      if (kind === '通信URL追加') content += 'fetch("http://127.0.0.1:5174/api/sample");';
      if (kind === '直接引数') content = `fetch(${JSON.stringify(source)});`;
      if (kind === 'template補間')
        content = "const files = { 'app/data-url.ts': `http://127.0.0.1:${port}/api/sample` };";
      const name = kind === '他chunk' ? 'app' : 'next-project-protocol';
      await expect(
        checkStaticArtifact(await artifact(`assets/${name}-reviewed.js`, content)),
      ).rejects.toThrow(/開発URL/u);
    },
  );

  it.each([
    '固定Source',
    'editable',
    '別path',
    '別exercise',
    '別Course',
    '改変Source',
    '他fieldURL',
  ])('Next Lesson JSONの%sを契約に従って照合する', async (kind) => {
    const source = nextWorkspace('next-ch03-l01-e01')!.files['app/data-url.ts'];
    if (source === undefined) throw new Error('固定Next Sourceがありません');
    const document = {
      courseId: kind === '別Course' ? 'javascript' : 'next',
      lesson: {
        id: 'next-ch03-l01',
        title: kind === '他fieldURL' ? 'http://localhost:5174' : '教材',
        exercises: [
          {
            id: kind === '別exercise' ? 'next-ch03-l02-e01' : 'next-ch03-l01-e01',
            files: [
              {
                path: kind === '別path' ? 'app/page.tsx' : 'app/data-url.ts',
                editable: kind === 'editable',
                content: kind === '改変Source' ? source.replace('5174', '5175') : source,
              },
            ],
          },
        ],
      },
    };
    const root = await artifact('extra.json', '{}');
    await mkdir(path.join(root, 'generated/content/courses/next/lessons'), { recursive: true });
    await writeFile(
      path.join(root, 'generated/content/courses/next/lessons/next-ch03-l01.json'),
      JSON.stringify(document),
    );
    if (kind === '固定Source') await expect(checkStaticArtifact(root)).resolves.toBeDefined();
    else await expect(checkStaticArtifact(root)).rejects.toThrow(/開発URL/u);
  });

  it('TSの技術検査を正式契約の15 Lessonへ合わせ、公開承認は専用Gateへ委ねる', async () => {
    const report = await checkStaticArtifact(await typescriptArtifact(), 'typescript');
    expect(report.files).toBeGreaterThan(20);
    expect(resolveReleaseCourseContract('typescript').lessonCount).toBe(15);
  });

  it.each(['index.json', 'lessons/typescript-ch01-l01.json'])(
    'TSの%sの公開bytes改変を拒否する',
    async (relative) => {
      const root = await typescriptArtifact();
      const file = path.join(root, 'generated/content/courses/typescript', relative);
      await writeFile(file, `${await readFile(file, 'utf8')} `);
      await expect(checkStaticArtifact(root, 'typescript')).rejects.toThrow(/SHA/u);
    },
  );

  it('TSの欠落LessonとProvenanceを拒否する', async () => {
    const root = await typescriptArtifact();
    const provenance = path.join(root, 'generated/content/courses/typescript/provenance.json');
    const bytes = await readFile(provenance);
    await rm(provenance);
    await expect(checkStaticArtifact(root, 'typescript')).rejects.toThrow();
    await writeFile(provenance, bytes);
    await rm(
      path.join(root, 'generated/content/courses/typescript/lessons/typescript-ch01-l01.json'),
    );
    await expect(checkStaticArtifact(root, 'typescript')).rejects.toThrow(/不足/u);
  });

  it('許可された静的Fileと必須Artifactだけなら受理する', async () => {
    await expect(checkStaticArtifact(await artifact('extra.json', '{}'))).resolves.toEqual({
      files: 6,
    });
  });

  it.each([
    ['server.php', '<?php'],
    ['app.js.map', '{}'],
    ['bad.js', 'http://localhost:3000'],
    ['root.css', 'url(/assets/font.woff2)'],
    ['answer.json', '{"solutionFiles":[]}'],
    [
      'leaked.provenance.json',
      '{"items":[{"visibility":"authoring","path":"exercise/fixtures/missing.html"}]}',
    ],
  ])('%sを拒否する', async (name, content) => {
    await expect(checkStaticArtifact(await artifact(name, content))).rejects.toThrow();
  });

  it('React Routerのlocation欠落時URL組立fallbackだけをhashed router chunkで許可する', async () => {
    const root = await artifact(
      'assets/router-reviewed.js',
      'function xe(e,t,n=!1){let r=`http://localhost`;e&&(r=e.location.origin===`null`?e.location.href:e.location.origin),I(r,`No window.location.(origin|href) available to create URL`);let i=typeof t==`string`?t:ve(t);return i=i.replace(/ $/,`%20`),!n&&ue.test(i)&&(i=r+i),new URL(i,r)}',
    );

    await expect(checkStaticArtifact(root)).resolves.toEqual({ files: 6 });
  });

  it('review済みfallbackのorigin変数を通信へ流用する改変を拒否する', async () => {
    const root = await artifact(
      'assets/index-reviewed.js',
      'function ae(e,t,n=!1){let r=`http://localhost`;e&&(r=e.location.origin===`null`?e.location.href:e.location.origin),D(r,`No window.location.(origin|href) available to create URL`);fetch(r);let i=typeof t==`string`?t:k(t);return i=i.replace(/ $/,`%20`),!n&&S.test(i)&&(i=r+i),new URL(i,r)}',
    );

    await expect(checkStaticArtifact(root)).rejects.toThrow(/開発URL/iu);
  });

  it('公開CourseがないArtifactを拒否する', async () => {
    const root = await artifact('extra.json', '{}');
    await rm(path.join(root, 'generated/content/courses/html-css/index.json'));
    await expect(checkStaticArtifact(root)).rejects.toThrow();
  });

  it.each(['generated/content/catalog.json', 'generated/content/courses/html-css.json'])(
    '旧v2教材Artifactを拒否する: %s',
    async (legacyPath) => {
      const root = await artifact('extra.json', '{}');
      await writeFile(path.join(root, legacyPath), '{}');

      await expect(checkStaticArtifact(root)).rejects.toThrow(/旧v2教材Artifact/u);
    },
  );
});
