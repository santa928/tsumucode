// @vitest-environment node
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LessonSchema } from '../../../../src/core/content/schema';
import {
  compileCourse,
  type CompiledCourseArtifacts,
} from '../../../../scripts/content/compileCourse';

let html: CompiledCourseArtifacts;
const roots: string[] = [];
beforeAll(async () => {
  html = await compileCourse('content/html-css');
});
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('manifest driven release inventory', () => {
  it('includes a new topic and lesson without a course-name or lesson-count registration', async () => {
    const { buildInventory } = await import('../../../../scripts/release/v2/inventory');
    const original = structuredClone(html.runtime);
    const first = original.phases[0]!.chapters[0]!.lessons[0]!;
    const added = LessonSchema.parse(
      JSON.parse(JSON.stringify(first).replaceAll(first.id, 'future-new-lesson')),
    );
    original.phases[0]!.chapters[0]!.lessons.push(added);
    const assets = new Map(html.assets);
    for (const [assetPath, bytes] of html.assets) {
      if (assetPath.includes(first.id)) assets.set(assetPath.replaceAll(first.id, added.id), bytes);
    }
    const authoringExercises = [
      ...html.authoringExercises!,
      ...added.exercises.map((exercise) => {
        const full = html.authoringExercises!.find(
          (item) => item.id === exercise.id.replace(added.id, first.id),
        );
        if (!full) throw new Error('Missing test exercise source');
        return { ...full, ...exercise };
      }),
    ];
    const result = buildInventory([
      { ...html, assets, authoringExercises, runtime: { ...original, id: 'future-topic' } },
    ]);
    expect(result.courses.map((course) => course.id)).toEqual(['future-topic']);
    expect(result.courses[0]!.lessons.some((lesson) => lesson.id === 'future-new-lesson')).toBe(
      true,
    );
  });

  it('plans every authored fixture plus solution and starter for each exercise', async () => {
    const { buildInventory } = await import('../../../../scripts/release/v2/inventory');
    const { planRelease } = await import('../../../../scripts/release/v2/plan');
    const inventory = buildInventory([html]);
    const plan = planRelease(inventory);
    const first = inventory.courses[0]!.lessons[0]!.exercises[0]!;
    const fixtureTargets = plan.targets.filter(
      (target) => target.kind === 'fixture' && target.exerciseId === first.id,
    );
    expect(fixtureTargets.map((target) => target.fixtureId).sort()).toEqual(
      ['solution', 'starter', ...first.fixtures.map((fixture) => fixture.id)].sort(),
    );
    expect(new Set(plan.targets.map((target) => target.key)).size).toBe(plan.targets.length);
  });

  it('does not reset learner evaluation for a course revision or navigation-only edit', async () => {
    const { buildInventory } = await import('../../../../scripts/release/v2/inventory');
    const before = buildInventory([html]);
    const changed = structuredClone(html.runtime);
    changed.revision = '2099-01-01.1';
    changed.phases[0]!.chapters[0]!.lessons[0]!.nextLessonId = 'another-lesson';
    const after = buildInventory([{ ...html, runtime: changed }]);
    expect(after.courses[0]!.lessons[0]!.learnerDigest).toBe(
      before.courses[0]!.lessons[0]!.learnerDigest,
    );
    expect(after.courses[0]!.lessons[0]!.navigationDigest).not.toBe(
      before.courses[0]!.lessons[0]!.navigationDigest,
    );
  });

  it('rejects unknown runtime capabilities instead of planning an empty passing suite', async () => {
    const { buildInventory } = await import('../../../../scripts/release/v2/inventory');
    expect(() =>
      buildInventory([{ ...html, runtime: { ...html.runtime, runnerId: 'unimplemented-runner' } }]),
    ).toThrow();
  });

  it('excludes draft topics from publication targets without approving their content', async () => {
    const { buildInventory } = await import('../../../../scripts/release/v2/inventory');
    const { planRelease } = await import('../../../../scripts/release/v2/plan');
    const inventory = buildInventory([
      { ...html, runtime: { ...html.runtime, publicationStatus: 'draft' } },
    ]);
    expect(inventory.courses[0]!.publicationStatus).toBe('draft');
    expect(() => planRelease(inventory)).toThrow(/published|公開/);
  });
});

describe('immutable artifact identity', () => {
  it('rejects DEL in artifact file names instead of accepting ambiguous paths', async () => {
    const { hashArtifact } = await import('../../../../scripts/release/v2/identity');
    const root = await mkdtemp(path.join(tmpdir(), 'flow-control-'));
    roots.push(root);
    await writeFile(path.join(root, 'bad' + String.fromCharCode(127) + '.js'), 'code');
    await expect(hashArtifact(root)).rejects.toThrow(/canonical/);
  });

  it('hashes bytes and canonical paths, independent of creation order', async () => {
    const { hashArtifact } = await import('../../../../scripts/release/v2/identity');
    const one = await mkdtemp(path.join(tmpdir(), 'flow-one-'));
    roots.push(one);
    const two = await mkdtemp(path.join(tmpdir(), 'flow-two-'));
    roots.push(two);
    await mkdir(path.join(one, 'assets'));
    await mkdir(path.join(two, 'assets'));
    await writeFile(path.join(one, 'index.html'), 'site');
    await writeFile(path.join(one, 'assets', 'a.js'), 'code');
    await writeFile(path.join(two, 'assets', 'a.js'), 'code');
    await writeFile(path.join(two, 'index.html'), 'site');
    expect((await hashArtifact(one)).digest).toBe((await hashArtifact(two)).digest);
    await writeFile(path.join(two, 'assets', 'a.js'), 'different');
    expect((await hashArtifact(one)).digest).not.toBe((await hashArtifact(two)).digest);
  });

  it('rejects a symlink even when it points at an ordinary artifact file', async () => {
    const { hashArtifact } = await import('../../../../scripts/release/v2/identity');
    const root = await mkdtemp(path.join(tmpdir(), 'flow-link-'));
    roots.push(root);
    await writeFile(path.join(root, 'index.html'), 'site');
    await symlink(path.join(root, 'index.html'), path.join(root, 'alias.html'));
    await expect(hashArtifact(root)).rejects.toThrow(/symbolic|symlink|通常|link/i);
  });
});
