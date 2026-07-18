// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseStylesheet = readFileSync(
  new URL('../src/design-system/base.css', import.meta.url),
  'utf8',
);

describe('Tailwind source detection', () => {
  it('自動探索を止め、本番UI sourceだけを明示する', () => {
    expect(baseStylesheet).toContain("@import 'tailwindcss' source(none);");
    const sourceDirectives = baseStylesheet
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('@source '));
    expect(sourceDirectives).toEqual(["@source '../';", "@source '../../index.html';"]);
  });
});
