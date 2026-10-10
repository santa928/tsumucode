import ts from 'typescript';
import { nextWorkspace } from '../local/next-project-protocol.mjs';
import packaging from '../local/next-portable-packaging.json';

const WORKSPACES = [
  'next-ch03-l01-e01',
  'next-ch03-l02-e01',
  'next-ch04-l01-e01',
  'next-ch04-l02-e01',
  'next-ch05-l01-e01',
  'next-ch06-l01-e01',
];
const DISPLAY_FILES = new Map<string, Set<string>>();
for (const workspace of WORKSPACES) {
  const contract = nextWorkspace(workspace)!;
  for (const path of contract.readonlyFiles ?? []) {
    const content = contract.files[path]!;
    if (!content.includes('http://127.0.0.1')) continue;
    const contents = DISPLAY_FILES.get(path) ?? new Set<string>();
    contents.add(content);
    DISPLAY_FILES.set(path, contents);
  }
}

/** 実行用URLの一般除外はせず、固定教材の表示用SourceとZIP READMEだけを照合する。 */
export function withoutReviewedNextSource(relative: string, source: string): string {
  const lessonMatch =
    /^generated\/content\/courses\/next\/lessons\/(next-ch\d{2}-l\d{2})\.json$/u.exec(relative);
  if (lessonMatch) {
    const workspace = `${lessonMatch[1]}-e01`;
    if (!WORKSPACES.includes(workspace)) return source;
    const contract = nextWorkspace(workspace)!;
    const document = JSON.parse(source);
    if (document.courseId !== 'next' || document.lesson?.id !== lessonMatch[1]) return source;
    for (const exercise of document.lesson.exercises ?? []) {
      if (exercise.id !== workspace) continue;
      for (const file of exercise.files ?? []) {
        if (
          file.editable === false &&
          contract.readonlyFiles?.includes(file.path) &&
          DISPLAY_FILES.get(file.path)?.has(file.content) &&
          file.content === contract.files[file.path]
        )
          file.content = 'reviewed-next-display-source';
      }
    }
    return JSON.stringify(document);
  }
  if (!/^assets\/(?:next-project-protocol|portableNextArchive)-[A-Za-z0-9_-]+\.js$/u.test(relative))
    return source;
  const parsed = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const ranges: { start: number; end: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.initializer)) {
      const name =
        ts.isStringLiteral(node.name) || ts.isIdentifier(node.name) ? node.name.text : '';
      const content = node.initializer.text;
      const approved = relative.startsWith('assets/portableNextArchive-')
        ? name === 'README.md' && content === packaging['README.md']
        : DISPLAY_FILES.get(name)?.has(content);
      if (approved)
        ranges.push({ start: node.initializer.getStart(parsed), end: node.initializer.end });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  for (const { start, end } of ranges.sort((a, b) => b.start - a.start)) {
    source = `${source.slice(0, start)}"reviewed-next-display-source"${source.slice(end)}`;
  }
  return source;
}
