// @vitest-environment node
import { expect, it } from 'vitest';
import { publishedProofUrl } from '../../../../scripts/release/v2/publishedProofUrl';

const site = 'https://example.github.io/course/';
it('retains the configured site and discards only the observed route and search', () => {
  expect(publishedProofUrl(site + '?synthetic=1#/courses/example', site)).toBe(site);
  expect(
    publishedProofUrl('http://127.0.0.1:4173/probe/#/lesson', 'http://127.0.0.1:4173/probe/'),
  ).toBe('http://127.0.0.1:4173/probe/');
  expect(publishedProofUrl('https://example.github.io:443/course/#/lesson', site)).toBe(site);
});

it.each([
  ['https://other.invalid/course/secret-sentinel', site],
  [site + 'secret-sentinel', site],
  ['https://example.github.io/course', site],
  ['http://example.github.io/course/', site],
  ['https://example.github.io:444/course/', site],
  ['https://secret-sentinel:fake@example.github.io/course/', site],
  [site, 'https://secret-sentinel:fake@example.github.io/course/'],
  [site, site + '?secret-sentinel'],
  [site, site + '#secret-sentinel'],
  [site, site + '?'],
  [site, site + '#'],
  ['not-a-url-secret-sentinel', site],
  [site, undefined],
] as const)('rejects an unsafe page or base with a fixed error', (page, base) => {
  try {
    publishedProofUrl(page, base);
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const failure = error as Error;
    expect(failure.message).toBe('Public operation page URL is invalid');
    expect(failure.stack).not.toContain('secret-sentinel');
    expect(failure.cause).toBeUndefined();
  }
});
