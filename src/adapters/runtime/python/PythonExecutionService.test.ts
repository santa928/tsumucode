import { expect, it, vi } from 'vitest';
import type { ExecutionRequest } from '../../../core/runtime/contracts';
import { PythonExecutionService } from './PythonExecutionService';

const request: ExecutionRequest = {
  runId: 'module-run',
  exerciseSessionId: 'module-session',
  executionRevision: 1,
  backend: 'browser',
  engine: 'browser-python',
  languageId: 'python',
  requiredCapabilities: ['console'],
  files: { 'main.py': '', 'lesson_tools.py': '' },
  options: {},
};

/** 不正なfile要求は固定coreの準備・frame作成より先に拒否する。 */
it('Browser入口は欠落・追加path・合計容量超過を実行準備へ渡さない', async () => {
  const loadCore = vi.fn(async () => {
    throw new Error('不正要求でcoreを準備してはいけません。');
  });
  const service = new PythonExecutionService(loadCore, 'module-import-v1');
  for (const files of [
    { 'main.py': '' },
    { ...request.files, '../main.py': '' },
    { ...request.files, '/workspace/lesson_tools.py': '' },
    { ...request.files, 'os.py': '' },
    { 'main.py': 'あ'.repeat(20000), 'lesson_tools.py': 'あ'.repeat(20000) },
  ]) {
    const result = await service.execute({ ...request, files });
    expect(result.status).toBe('unsupported');
    expect(result.evidence).toEqual([]);
  }
  expect(loadCore).not.toHaveBeenCalled();
  expect(document.querySelectorAll('iframe')).toHaveLength(0);
});
