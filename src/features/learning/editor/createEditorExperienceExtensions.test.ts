/** Editor共通Extensionが2 Space IndentとWorkshop Token Styleを提供することを検証する。 */
import { highlightingFor, indentUnit } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';
import { createEditorExperienceExtensions } from './createEditorExperienceExtensions';

describe('createEditorExperienceExtensions', () => {
  it('2 Space indentとToken highlighterをEditor Stateへ提供する', () => {
    const state = EditorState.create({
      doc: '<main></main>',
      extensions: createEditorExperienceExtensions(),
    });

    expect(state.facet(indentUnit)).toBe('  ');
    expect(highlightingFor(state, [tags.tagName])).toBeTruthy();
  });
});
