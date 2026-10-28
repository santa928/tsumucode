import type { TestInfo } from '@playwright/test';
import { loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import {
  createPythonFixtureObservations,
  type PythonFixtureExecution,
} from '../../../scripts/release/v2/pythonCoverage';
let source: ReturnType<typeof loadAuthoringCourse> | undefined;
/** Runtime evidence only, never a learner-review receipt. No submitted Source appears in the attachment. */
export async function attachPythonFixtureCoverage(info: TestInfo, actual: PythonFixtureExecution) {
  if (info.project.name === 'firefox' || info.project.name === 'webkit') return;
  const authoring = await (source ??= loadAuthoringCourse('content/python-basics'));
  await info.attach('release-fixtures-v1', {
    body: JSON.stringify(createPythonFixtureObservations(authoring, actual)),
    contentType: 'application/json',
  });
}
