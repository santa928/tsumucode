import process from 'node:process';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { NEXT_WORKSPACE, nextWorkspace } from './next-project-protocol.mjs';

// 作者image内の、Compile検査済み正負Fixtureだけを製品APIの検証へ渡す。
const workspace = process.argv[2] ?? NEXT_WORKSPACE;
if (!nextWorkspace(workspace)) throw new Error('未対応の作者用Next Workspaceです。');
const course = process.argv[3] ?? 'next';
const lesson = process.argv[4] ?? workspace.slice(0, -4);
const exerciseId = process.argv[5] ?? workspace;
if (
  process.argv.length > 6 ||
  [course, lesson, exerciseId].some((value) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value))
)
  throw new Error('作者用のCourse/Lesson/Exercise IDが不正です。');
const chapters = `content/${course}/chapters`;
const matches = [];
for (const chapter of await readdir(chapters, { withFileTypes: true })) {
  if (!chapter.isDirectory()) continue;
  const candidate = join(
    chapters,
    chapter.name,
    'lessons',
    lesson,
    'exercises',
    exerciseId,
    'exercise.yaml',
  );
  try {
    const stat = await lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('作者用Exerciseは通常Fileだけを使います。');
    matches.push(candidate);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
if (matches.length !== 1) throw new Error('作者用Exerciseが欠落または重複しています。');
const path = matches[0];
const exercise = parse(await readFile(path, 'utf8'));
const fixtures = [];
for (const fixture of exercise.fixtures) {
  const files = {};
  for (const file of fixture.files) {
    files[file.path] = await readFile(join(dirname(path), file.source), 'utf8');
  }
  fixtures.push({
    id: fixture.id,
    expectedStatus: fixture.expectedStatus,
    files,
    ...(nextWorkspace(workspace).ruleGoals
      ? {
          expectedChecks: exercise.validationRules.map((rule) => ({
            goal: rule.assertion.goal,
            passed: !fixture.expectedFeedbackRuleIds.includes(rule.id),
          })),
        }
      : {}),
  });
}
process.stdout.write(JSON.stringify(fixtures));
