import { expect, it } from 'vitest';
import { mapTypeScriptDiagnostics } from '../../../src/adapters/runtime/typescript/mapTypeScriptDiagnostics';
import type { RunnerDiagnostic } from '../../../src/core/runtime/contracts';

it.each(['index.html', 'styles.css'])('非JS診断 %s の元の位置と内容を保持する', (file) => {
  const diagnostic: RunnerDiagnostic = {
    code: 'blocked',
    kind: 'security',
    severity: 'error',
    message: 'blocked',
    learnerMessage: '使用できない操作です',
    file,
    line: 5,
    column: 3,
  };
  expect(mapTypeScriptDiagnostics([diagnostic], {}, {})).toEqual([diagnostic]);
});

it('対応不能の位置を推測せず省き、診断の内容と元データを維持する', () => {
  const diagnostic: RunnerDiagnostic = {
    code: 'blocked',
    kind: 'security',
    severity: 'error',
    message: 'blocked',
    learnerMessage: '使用できない操作です',
    file: 'src/main.js',
    line: 1,
    column: 1,
  };
  const detail = {
    code: diagnostic.code,
    kind: diagnostic.kind,
    severity: diagnostic.severity,
    message: diagnostic.message,
    learnerMessage: diagnostic.learnerMessage,
  };
  const sources = { 'src/main.ts': 'fetch("example");' };
  const map = {
    version: 3,
    file: 'main.js',
    sourceRoot: '',
    sources: ['main.ts'],
    names: [],
    mappings: 'AAAA',
  };
  for (const malformed of [
    undefined,
    '{',
    JSON.stringify({ ...map, sourceRoot: 'https://example.invalid/' }),
    JSON.stringify({ ...map, sources: ['other.ts'] }),
    JSON.stringify({ ...map, mappings: '' }),
  ]) {
    const maps = malformed === undefined ? {} : { 'src/main.js': malformed };
    expect(mapTypeScriptDiagnostics([diagnostic], maps, sources)).toEqual([detail]);
  }
  const maps = { 'src/main.js': JSON.stringify(map) };
  expect(mapTypeScriptDiagnostics([diagnostic], maps, sources)).toEqual([
    { ...detail, file: 'src/main.ts', line: 1, column: 1 },
  ]);
  expect(mapTypeScriptDiagnostics([{ ...diagnostic, line: 999 }], maps, sources)).toEqual([detail]);
  expect(diagnostic).toMatchObject({ file: 'src/main.js', line: 1, column: 1 });
});
