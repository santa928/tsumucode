// @vitest-environment node
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('release v2 command boundary', () => {
  it('writes a real manifest-derived shadow report with old record states and no new approvals', async () => {
    const { runCli } = await import('../../../../scripts/release/v2/cli');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-cli-'));
    roots.push(root);
    const output = path.join(root, 'shadow.json');
    await runCli(['shadow', '--root', process.cwd(), '--output', output]);
    const report = JSON.parse(await readFile(output, 'utf8')) as {
      status: string;
      inventory: { courses: { id: string; lessons: unknown[] }[] };
      shadow: { courses: { courseId: string; contentRows: string; publication: string }[] };
    };
    expect(report.status).toBe('shadow-only');
    expect(report.inventory.courses.some((course) => course.id === 'python-basics')).toBe(true);
    expect(
      report.shadow.courses
        .filter((course) => course.contentRows !== 'valid')
        .map((course) => course.courseId),
    ).toEqual(['python-basics']);
    expect(
      report.shadow.courses.find((course) => course.courseId === 'html-css')!.publication,
    ).toBe('pending');
  }, 30000);
  it('refuses unknown commands, options, missing output and existing output ownership', async () => {
    const { runCli } = await import('../../../../scripts/release/v2/cli');
    await expect(runCli(['deploy'])).rejects.toThrow();
    await expect(runCli(['shadow', '--raw-original', 'secret'])).rejects.toThrow();
    await expect(runCli(['shadow'])).rejects.toThrow();
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-cli-owner-'));
    roots.push(root);
    const output = path.join(root, 'owned.json');
    await writeFile(output, 'already-owned');
    await expect(runCli(['shadow', '--root', process.cwd(), '--output', output])).rejects.toThrow();
    expect(await readFile(output, 'utf8')).toBe('already-owned');
  });
});
