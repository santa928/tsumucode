import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { NEXT_WORKSPACE, nextWorkspace } from './next-project-protocol.mjs';

// 作者image内の、Compile検査済み正負Fixtureだけを製品APIの検証へ渡す。
const workspace = process.argv[2] ?? NEXT_WORKSPACE;
if (!nextWorkspace(workspace)) throw new Error('未対応の作者用Next Workspaceです。');
const lesson = workspace.slice(0, -4);
const chapter = lesson.slice(0, -4);
const path = `content/next/chapters/${chapter}/lessons/${lesson}/exercises/${workspace}/exercise.yaml`;
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
