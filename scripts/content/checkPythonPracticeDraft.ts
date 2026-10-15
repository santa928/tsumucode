/** Python実践の草稿Sourceと検査するdistを照合し、公開承認とは区別する。 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkDraftCourseArtifact, runDraftCourseCli } from './checkDraftCourseArtifact';

/** Python実践の固定Courseを読み取り照合する。不一致や草稿条件未達は例外で拒否する。 */
export function checkPythonPracticeDraft(root: string, distDir: string) {
  return checkDraftCourseArtifact(root, distDir, 'python-practice');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runDraftCourseCli('python-practice');
}
