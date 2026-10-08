import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

// 作者image内の、Compile検査済み正負Fixtureだけを製品APIの検証へ渡す。
const path =
  'content/next/chapters/next-ch01/lessons/next-ch01-l01/exercises/next-ch01-l01-e01/exercise.yaml';
const exercise = parse(await readFile(path, 'utf8'));
const fixtures = [];
for (const fixture of exercise.fixtures) {
  const files = {};
  for (const file of fixture.files) {
    files[file.path] = await readFile(join(dirname(path), file.source), 'utf8');
  }
  fixtures.push({ id: fixture.id, expectedStatus: fixture.expectedStatus, files });
}
process.stdout.write(JSON.stringify(fixtures));
