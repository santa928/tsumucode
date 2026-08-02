import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileContent } from './compile';
import { readSplitCourseArtifacts } from './readSplitCourseArtifacts';

const temporaryRoots: string[] = [];

/** 分割教材を含む一時public rootを生成する。 */
async function createCompiledPublicRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-read-split-'));
  temporaryRoots.push(root);
  const sourceRoot = path.join(root, 'source');
  const publicRoot = path.join(root, 'public');
  await cp(path.resolve('tests/fixtures/foundation-content'), sourceRoot, { recursive: true });
  await compileContent({
    sourceRoot,
    outputRoot: path.join(publicRoot, 'generated/content'),
    checkOnly: false,
  });
  return publicRoot;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('readSplitCourseArtifacts', () => {
  it('Catalog・Index・全Lessonのintegrityを検証してCourseを再構成する', async () => {
    const publicRoot = await createCompiledPublicRoot();

    const course = await readSplitCourseArtifacts(publicRoot, 'html-css');

    expect(course.id).toBe('html-css');
    expect(course.phases[0]?.chapters[0]?.lessons[0]?.id).toBe('lesson-first-heading');
    expect(course.provenanceManifestPath).toBe(
      'generated/content/courses/html-css/provenance.json',
    );
  });

  it('Catalogと一致しないIndex bytesを拒否する', async () => {
    const publicRoot = await createCompiledPublicRoot();
    const indexPath = path.join(publicRoot, 'generated/content/courses/html-css/index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as { title: string };
    index.title = '改ざんされた教材';
    await writeFile(indexPath, JSON.stringify(index), 'utf8');

    await expect(readSplitCourseArtifacts(publicRoot, 'html-css')).rejects.toThrow(
      'Course IndexのSHAが一致しません',
    );
  });

  it('Indexと一致しないLesson bytesを拒否する', async () => {
    const publicRoot = await createCompiledPublicRoot();
    const lessonPath = path.join(
      publicRoot,
      'generated/content/courses/html-css/lessons/lesson-first-heading.json',
    );
    const lesson = JSON.parse(await readFile(lessonPath, 'utf8')) as {
      lesson: { title: string };
    };
    lesson.lesson.title = '改ざんされたLesson';
    await writeFile(lessonPath, JSON.stringify(lesson), 'utf8');

    await expect(readSplitCourseArtifacts(publicRoot, 'html-css')).rejects.toThrow(
      'Lesson ManifestのSHAが一致しません',
    );
  });

  it('Indexにない余分なLesson fileを拒否する', async () => {
    const publicRoot = await createCompiledPublicRoot();
    await writeFile(
      path.join(publicRoot, 'generated/content/courses/html-css/lessons/extra.json'),
      '{}',
      'utf8',
    );

    await expect(readSplitCourseArtifacts(publicRoot, 'html-css')).rejects.toThrow(
      'Indexにない余分なLesson Artifactです',
    );
  });
});
