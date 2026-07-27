/** Workshop背景上でCodeの役割を高Contrastに区別するToken Styleを定義する。 */
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const workshopHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.tagName, tags.typeName, tags.className],
    color: 'var(--tc-code-token-tag)',
  },
  {
    tag: [tags.attributeName, tags.propertyName],
    color: 'var(--tc-code-token-property)',
  },
  {
    tag: [tags.string, tags.attributeValue],
    color: 'var(--tc-code-token-string)',
  },
  {
    tag: [tags.number, tags.bool, tags.atom],
    color: 'var(--tc-code-token-number)',
  },
  {
    tag: [tags.keyword, tags.operatorKeyword],
    color: 'var(--tc-code-token-keyword)',
  },
  {
    tag: [tags.comment, tags.meta],
    color: 'var(--tc-code-token-comment)',
  },
  {
    tag: tags.invalid,
    color: 'var(--tc-code-token-invalid)',
    textDecoration: 'underline',
  },
]);
