/** Workshop PaletteのCode Token区別がCodeMirror highlighterへ登録されることを検証する。 */
import { highlightingFor, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';
import { workshopHighlightStyle } from './workshopHighlightStyle';

describe('workshopHighlightStyle', () => {
  it('Tag・Property・Stringを異なるHighlight classへ写像する', () => {
    const state = EditorState.create({
      extensions: syntaxHighlighting(workshopHighlightStyle),
    });

    const tagClass = highlightingFor(state, [tags.tagName]);
    const propertyClass = highlightingFor(state, [tags.propertyName]);
    const stringClass = highlightingFor(state, [tags.string]);
    expect(tagClass).toBeTruthy();
    expect(new Set([tagClass, propertyClass, stringClass]).size).toBe(3);
  });
});
