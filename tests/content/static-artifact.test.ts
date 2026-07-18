// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkStaticArtifact } from '../../scripts/release/checkStaticArtifact';

const temporaryRoots: string[] = [];

/** 最小の正常Artifactへ検査対象Fileを1件加える。 */
async function artifact(extraName: string, extraContent: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-artifact-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'generated/content/courses'), { recursive: true });
  await mkdir(path.join(root, 'assets'));
  await writeFile(
    path.join(root, 'index.html'),
    '<script src="/repository-name/assets/app.js"></script>',
  );
  await writeFile(path.join(root, 'assets/app.js'), 'Progateとは提携・関連していません');
  await writeFile(path.join(root, 'generated/content/courses/html-css.json'), '{}');
  await writeFile(path.join(root, extraName), extraContent);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('static artifact', () => {
  it('許可された静的Fileと必須Artifactだけなら受理する', async () => {
    await expect(checkStaticArtifact(await artifact('extra.json', '{}'))).resolves.toEqual({
      files: 4,
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

  it('React Routerのlocation欠落時URL組立fallbackだけをhashed entry chunkで許可する', async () => {
    const root = await artifact(
      'assets/index-reviewed.js',
      'function ae(e,t,n=!1){let r=`http://localhost`;e&&(r=e.location.origin===`null`?e.location.href:e.location.origin),D(r,`No window.location.(origin|href) available to create URL`);let i=typeof t==`string`?t:k(t);return i=i.replace(/ $/,`%20`),!n&&S.test(i)&&(i=r+i),new URL(i,r)}',
    );

    await expect(checkStaticArtifact(root)).resolves.toEqual({ files: 4 });
  });

  it('review済みfallbackのorigin変数を通信へ流用する改変を拒否する', async () => {
    const root = await artifact(
      'assets/index-reviewed.js',
      'function ae(e,t,n=!1){let r=`http://localhost`;e&&(r=e.location.origin===`null`?e.location.href:e.location.origin),D(r,`No window.location.(origin|href) available to create URL`);fetch(r);let i=typeof t==`string`?t:k(t);return i=i.replace(/ $/,`%20`),!n&&S.test(i)&&(i=r+i),new URL(i,r)}',
    );

    await expect(checkStaticArtifact(root)).rejects.toThrow(/開発URL/iu);
  });

  it('非提携NoticeがないArtifactを拒否する', async () => {
    const root = await artifact('extra.json', '{}');
    await writeFile(path.join(root, 'assets/app.js'), 'safe application');
    await expect(checkStaticArtifact(root)).rejects.toThrow('非提携Notice');
  });

  it('公開CourseがないArtifactを拒否する', async () => {
    const root = await artifact('extra.json', '{}');
    await rm(path.join(root, 'generated/content/courses/html-css.json'));
    await expect(checkStaticArtifact(root)).rejects.toThrow();
  });
});
