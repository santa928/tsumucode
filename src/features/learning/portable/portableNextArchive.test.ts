/** 完全Sourceの保持と固定包装、別Workspace/履歴/欠落をZIPへ混入させない境界を確認する。 */
import { strFromU8, unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import { nextWorkspace } from '../../../../scripts/local/next-project-protocol.mjs';
import { createPortableNextArchive } from './portableNextArchive';

it.each(['next-ch05-l01-e01', 'next-ch06-l01-e01'])(
  '未保存の%sを固定lockと画像付きで保持し、元Sourceを変更しない',
  (id) => {
    const files = { ...nextWorkspace(id)!.files, 'app/page.tsx': '<h1>自分の制作途中 🌱</h1>\n' };
    const before = { ...files };
    const entries = unzipSync(createPortableNextArchive(id, files));
    expect(strFromU8(entries['app/page.tsx']!)).toBe(files['app/page.tsx']);
    expect(strFromU8(entries['public/banner.svg']!)).toContain('<svg');
    const manifest = JSON.parse(strFromU8(entries['package.json']!)) as {
      dependencies: { next: string; react: string };
      name: string;
    };
    const lock = JSON.parse(strFromU8(entries['package-lock.json']!)) as {
      packages: Record<string, { name?: string; version?: string }>;
    };
    expect(manifest.dependencies).toMatchObject({ next: '16.3.8', react: '19.2.7' });
    expect(lock.packages['']?.name).toBe(manifest.name);
    expect(lock.packages['node_modules/next']?.version).toBe('16.3.8');
    expect(strFromU8(entries['Dockerfile']!)).toContain('npm ci --ignore-scripts');
    expect(strFromU8(entries['README.md']!)).toContain('未保存・未合格');
    expect(
      Object.keys(entries).some((path) => /progress|solution|token|\.git|\.next/u.test(path)),
    ).toBe(false);
    expect(files).toEqual(before);
  },
);

it('別教材・未知/欠落/継承Source・変更されたreadonlyデータを拒否する', () => {
  const id = 'next-ch05-l01-e01';
  const files = nextWorkspace(id)!.files;
  expect(() => createPortableNextArchive('next-ch04-l01-e01', files)).toThrow('未対応');
  expect(() => createPortableNextArchive(id, { ...files, '../secret.json': 'private' })).toThrow(
    'そろって',
  );
  expect(() => createPortableNextArchive(id, { ...files, 'progress.json': 'history' })).toThrow(
    'そろって',
  );
  expect(() => createPortableNextArchive(id, {})).toThrow('そろって');
  expect(() =>
    createPortableNextArchive(id, Object.create(files) as Record<string, string>),
  ).toThrow('そろって');
  expect(() => createPortableNextArchive(id, { ...files, 'app/data.ts': '別のデータ' })).toThrow(
    '一致',
  );
});

it('UTF-8の100 KiB境界を超えるSourceを持ち出さない', () => {
  const id = 'next-ch05-l01-e01';
  const files = nextWorkspace(id)!.files;
  expect(() =>
    createPortableNextArchive(id, { ...files, 'app/page.tsx': 'あ'.repeat(40_000) }),
  ).toThrow('100 KiB');
});
