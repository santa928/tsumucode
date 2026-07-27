import { describe, expect, it } from 'vitest';
import { resolveInitialAppMode } from './initialMode';

describe('resolveInitialAppMode', () => {
  it.each(['#/library', '#/library/', '#/library/html-css'])(
    'Library rootと子RouteをLibrary entryへ振り分ける: %s',
    (hash) => {
      expect(resolveInitialAppMode(hash)).toBe('library');
    },
  );

  it.each(['', '#/', '#/courses/html-css', '#/library-preview'])(
    '通常学習または未知Routeを通常学習entryへ振り分ける: %s',
    (hash) => {
      expect(resolveInitialAppMode(hash)).toBe('normal-learning');
    },
  );
});
