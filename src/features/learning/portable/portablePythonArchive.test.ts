import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createPortablePythonArchive } from './portablePythonArchive';

const id = 'python-basics-ch02-l01-e01';
const files = {
  'main.py': 'from lesson_tools import add\n',
  'lesson_tools.py': 'def add(a, b):\n    return a + b\n',
};

it('固定2.pyとREADMEだけをZIPにし、元Sourceを変更しない', () => {
  const snapshot = { ...files };
  const entries = unzipSync(createPortablePythonArchive(id, files));
  expect(Object.keys(entries).sort()).toEqual(['README.md', 'lesson_tools.py', 'main.py']);
  for (const name of Object.keys(files))
    expect(strFromU8(entries[name]!)).toBe(files[name as keyof typeof files]);
  expect(strFromU8(entries['README.md']!)).toContain('python main.py');
  expect(files).toEqual(snapshot);
});

it('別Workspace・欠落・追加path・合計容量超過をZIPへ包装しない', () => {
  for (const rejected of [
    { 'main.py': '' },
    { ...files, '../secret.py': '' },
    { 'main.py': 'x'.repeat(102400), 'lesson_tools.py': 'x' },
  ])
    expect(() => createPortablePythonArchive(id, rejected)).toThrow();
  expect(() => createPortablePythonArchive('python-basics-ch01-l07-e01', files)).toThrow();
});
