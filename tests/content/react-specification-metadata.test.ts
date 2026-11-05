// @vitest-environment node
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'react-specification-metadata-'));
  await cp('content/react', root, { recursive: true });
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

it.each([
  ['react-ch02-l04', undefined, false],
  ['react-ch02-l04', 'requiresConcepts', true],
  ['react-ch02-l04', 'scaffoldLevel', true],
  ['react-ch02-l03', 'steps', true],
] as const)('%sの%s欠落を仕様制作の範囲だけで扱う', async (lesson, removed, missing) => {
  const file = path.join(
    root,
    `chapters/react-ch02/lessons/${lesson}/exercises/${lesson}-e01/exercise.yaml`,
  );
  const original = await readFile(file, 'utf8');
  try {
    const source = YAML.parse(original) as Record<string, unknown>;
    const edited = Object.fromEntries(Object.entries(source).filter(([key]) => key !== removed));
    await writeFile(file, YAML.stringify(edited));
    const result = await loadAuthoringCourse(root);
    expect(result.missingExerciseMetadata).toEqual(missing ? [`${lesson}/${lesson}-e01`] : []);
  } finally {
    await writeFile(file, original);
  }
});
