// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { analyzeReadingList } from '../../../src/adapters/runtime/react/checkReadingListSource';

function keyFact(body: string, before = ''): boolean {
  const result = analyzeReadingList({
    'BookCard.tsx': 'export function BookCard() { return <li>本</li>; }',
    'components.tsx': `${before}\nexport function App() { ${body} }`,
  });
  expect(result.diagnostics).toEqual([]);
  return result.facts.usesStableBookKeys;
}

describe('読書リストの項目IDとKey', () => {
  it.each([
    [
      'inline arrow',
      'return <ul>{books.map((book) => <BookCard key={book.id} book={book} />)}</ul>;',
    ],
    [
      'local declaration',
      'function renderBook(book: Book) { return <BookCard key={book.id} book={book} />; } return <ul>{books.map(renderBook)}</ul>;',
    ],
    [
      'local arrow',
      'const renderBook = (book: Book) => <BookCard key={book.id} book={book} />; return <ul>{books.map(renderBook)}</ul>;',
    ],
    [
      'local function expression',
      'const renderBook = function(book: Book) { return <BookCard key={book.id} book={book} />; }; return <ul>{books.map(renderBook)}</ul>;',
    ],
    [
      'keyed wrapper',
      'return <ul>{books.map((book) => <li key={book.id}><BookCard book={book} /></li>)}</ul>;',
    ],
  ])('%sでも返す項目のIDを確認する', (_name, body) => {
    expect(keyFact(body)).toBe(true);
  });

  it('同じファイルの関数へ分けたmapを確認する', () => {
    expect(
      keyFact(
        'return <ul>{books.map(renderBook)}</ul>;',
        'function renderBook(book: Book) { return <BookCard key={book.id} book={book} />; }',
      ),
    ).toBe(true);
  });

  it('map引数を別の描画関数へ渡す一段の関数でもKeyを確認する', () => {
    expect(
      keyFact(
        'return <ul>{books.map((book) => renderBook(book))}</ul>;',
        'function renderBook(item: Book) { return <BookCard key={item.id} book={item} />; }',
      ),
    ).toBe(true);
  });

  it('別の本を描画関数へ渡す場合は元のmap項目のKeyとしない', () => {
    expect(
      keyFact(
        'return <ul>{books.map((book) => renderBook(other))}</ul>;',
        'function renderBook(item: Book) { return <BookCard key={item.id} book={item} />; }',
      ),
    ).toBe(false);
  });

  it('同じ描画関数の結果を再利用しても各callの本の同一性は確認する', () => {
    expect(
      keyFact(
        'return <ul>{books.map((book) => renderBook(book))}{books.map((book) => renderBook(other))}</ul>;',
        'function renderBook(item: Book) { return <BookCard key={item.id} book={item} />; }',
      ),
    ).toBe(false);
  });

  it('非循環の共有描画関数を再展開せずAnalyzerの500ms内で確認する', () => {
    const helpers = [
      'function render0(book: Book) { return <BookCard key={book.id} book={book} />; }',
      ...Array.from(
        { length: 20 },
        (_, index) =>
          `function render${String(index + 1)}(book: Book) { if (book.read) return render${String(index)}(book); return render${String(index)}(book); }`,
      ),
    ].join('\n');
    const started = performance.now();
    const stable = keyFact('return <ul>{books.map(render20)}</ul>;', helpers);
    expect(performance.now() - started).toBeLessThan(500);
    expect(stable).toBe(true);
  });

  it.each([
    [
      'index',
      'return <ul>{books.map((book, index) => <BookCard key={index} book={book} />)}</ul>;',
    ],
    [
      'other item',
      'return <ul>{books.map((book) => <BookCard key={other.id} book={book} />)}</ul>;',
    ],
    [
      'nested key only',
      'return <ul>{books.map((book) => <li><BookCard key={book.id} book={book} /></li>)}</ul>;',
    ],
    [
      'unused renderer',
      'function renderBook(book: Book) { return <BookCard key={book.id} book={book} />; } return <ul>{books.map((book) => <BookCard book={book} />)}</ul>;',
    ],
    [
      'one unstable branch',
      'function renderBook(book: Book) { if (book.read) return <BookCard key={book.id} book={book} />; return <BookCard book={book} />; } return <ul>{books.map(renderBook)}</ul>;',
    ],
  ])('%sを安定したKeyとして認めない', (_name, body) => {
    expect(keyFact(body)).toBe(false);
  });

  it('同名の内側の変数が外側の正しい関数を隠している場合を通さない', () => {
    expect(
      keyFact(
        'const renderBook = (book: Book) => <BookCard key={0} book={book} />; return <ul>{books.map(renderBook)}</ul>;',
        'function renderBook(book: Book) { return <BookCard key={book.id} book={book} />; }',
      ),
    ).toBe(false);
  });

  it('callback引数を同名の外側の関数と取り違えない', () => {
    expect(
      keyFact(
        'function renderList(renderBook: (book: Book) => unknown) { return books.map(renderBook); } return <ul>{renderList((book) => <BookCard key={0} book={book} />)}</ul>;',
        'function renderBook(book: Book) { return <BookCard key={book.id} book={book} />; }',
      ),
    ).toBe(false);
  });

  it('State更新用のmapを表示のKey判定へ混ぜない', () => {
    expect(
      keyFact(
        'const updated = books.map((book) => ({ ...book, read: !book.read })); return <ul>{updated.map((book) => <BookCard key={book.id} book={book} />)}</ul>;',
      ),
    ).toBe(true);
  });

  it.each([
    'if (false) return <BookCard book={book} />; return <BookCard key={book.id} book={book} />;',
    'return <BookCard key={book.id} book={book} />; return <BookCard book={book} />;',
  ])('mapの実行されないreturnのKeyを判定へ混ぜない', (body) => {
    expect(keyFact(`return <ul>{books.map((book) => { ${body} })}</ul>;`)).toBe(true);
  });

  it('mapが実際に返す要素にKeyがなければ到達不能な正例があっても落とす', () => {
    expect(
      keyFact(
        'return <ul>{books.map((book) => { if (true) return <BookCard book={book} />; return <BookCard key={book.id} book={book} />; })}</ul>;',
      ),
    ).toBe(false);
  });

  it.each([
    'const bookId = book.id; return <BookCard key={bookId} book={book} />;',
    'const { id } = book; return <BookCard key={id} book={book} />;',
    'const row = <BookCard key={book.id} book={book} />; return row;',
  ])('同じ本のIDやJSXを一時変数へ置く別解を認める', (body) => {
    expect(keyFact(`return <ul>{books.map((book) => { ${body} })}</ul>;`)).toBe(true);
  });
});

describe('読書リストの部品と親Stateの使用経路', () => {
  const card =
    "import type { BookCardProps } from './types'; export function BookCard({ book, onToggle }: BookCardProps) { return <li><h2>{book.title}</h2><button onClick={() => onToggle(book.id)}>切り替える</button></li>; }";
  const imports =
    "import { useState } from 'react'; import { initialBooks } from './data'; import { BookCard } from './BookCard';";
  const list =
    'return <ul>{books.map((book) => <BookCard key={book.id} book={book} onToggle={() => undefined} />)}</ul>;';
  function facts(source: string, book = card) {
    const result = analyzeReadingList({ 'BookCard.tsx': book, 'components.tsx': source });
    expect(result.diagnostics).toEqual([]);
    return result.facts;
  }

  it('未使用の正しいBookCard定義を合格条件に数えない', () => {
    expect(
      facts(
        `${imports} export function App() { const [books] = useState(initialBooks); return <ul>{books.map((book) => <li key={book.id}>{book.title}</li>)}</ul>; }`,
      ).definesBookComponent,
    ).toBe(false);
  });

  it.each([
    `if (false) { ${list} }`,
    `if (true) return <p>本の一覧</p>; ${list}`,
    `return <p>本の一覧</p>; ${list}`,
  ])('実行されないreturnのBookCardを使用済みと数えない', (body) => {
    expect(
      facts(`${imports} export function App() { const [books] = useState(initialBooks); ${body} }`)
        .definesBookComponent,
    ).toBe(false);
  });

  it.each([
    `if (true) { ${list} } return <p>本の一覧</p>;`,
    `if (false) return <p>本の一覧</p>; ${list}`,
  ])('実行されるif分岐の部品・State・Keyを保持する', (body) => {
    expect(
      facts(`${imports} export function App() { const [books] = useState(initialBooks); ${body} }`),
    ).toEqual({ definesBookComponent: true, ownsReadingState: true, usesStableBookKeys: true });
  });

  it('画面更新だけのStateを、本を保持するStateと取り違えない', () => {
    expect(
      facts(
        `${imports} let books = initialBooks; export function App() { const [, render] = useState(0); ${list} }`,
      ).ownsReadingState,
    ).toBe(false);
  });

  it('未使用の正しいStateを、別の配列の表示元として認めない', () => {
    expect(
      facts(
        `${imports} export function App() { const [unused] = useState(initialBooks); const books = initialBooks; ${list} }`,
      ).ownsReadingState,
    ).toBe(false);
  });

  it.each([
    `${imports} function ReadingList() { const [books] = useState(initialBooks); ${list} } export function App() { return <ReadingList />; }`,
    `${imports} function BookRows({ books }: { books: readonly Book[] }) { ${list} } export function App() { const [books] = useState(initialBooks); return <BookRows books={books} />; }`,
    `${imports} function selectBooks(values: readonly Book[]) { return values.filter((book) => !book.read); } export function App() { const [source] = useState(initialBooks); const books = selectBooks(source); ${list} }`,
    `${imports} export function App() { const [source] = useState(initialBooks); const books = source; ${list} }`,
  ])('親や表示を別関数へ分けてもStateから本へつながる', (source) => {
    expect(facts(source)).toEqual({
      definesBookComponent: true,
      ownsReadingState: true,
      usesStableBookKeys: true,
    });
  });

  it.each([
    ['false &&', (jsx: string) => `false && (${jsx})`],
    ['true ||', (jsx: string) => `true || (${jsx})`],
    ['false条件の真側', (jsx: string) => `false ? (${jsx}) : null`],
    ['true条件の偽側', (jsx: string) => `true ? null : (${jsx})`],
  ])('実際には表示されない%sの部品を学習factに数えない', (_name, expression) => {
    const jsx = list.slice('return '.length, -1);
    expect(
      facts(
        `${imports} export function App() { const [books] = useState(initialBooks); return <>{${expression(jsx)}}</>; }`,
      ),
    ).toEqual({
      definesBookComponent: false,
      ownsReadingState: false,
      usesStableBookKeys: false,
    });
  });

  it.each([
    ['true &&', (jsx: string) => `true && (${jsx})`],
    ['false ||', (jsx: string) => `false || (${jsx})`],
    ['true条件の真側', (jsx: string) => `true ? (${jsx}) : null`],
    ['false条件の偽側', (jsx: string) => `false ? null : (${jsx})`],
  ])('表示される%sの正当な別解は認める', (_name, expression) => {
    const jsx = list.slice('return '.length, -1);
    expect(
      facts(
        `${imports} export function App() { const [books] = useState(initialBooks); return <>{${expression(jsx)}}</>; }`,
      ),
    ).toEqual({
      definesBookComponent: true,
      ownsReadingState: true,
      usesStableBookKeys: true,
    });
  });

  it('importとexportの別名で同じ部品を使う構成を認める', () => {
    const source = `${imports.replace('{ BookCard }', '{ BookCard as Row }')} export function App() { const [books] = useState(initialBooks); ${list.replaceAll('BookCard', 'Row')} }`;
    expect(
      facts(
        source,
        card.replace('export function BookCard', 'function Row') + '\nexport { Row as BookCard };',
      ),
    ).toEqual({ definesBookComponent: true, ownsReadingState: true, usesStableBookKeys: true });
  });
});

it('本の3項目を分割代入して同じ部品へ渡す別解を認める', () => {
  const checked = analyzeReadingList({
    'BookCard.tsx':
      'export function BookCard(props: BookCardProps) { return <li>{props.book.title}</li>; }',
    'components.tsx': `import { useState } from 'react'; import { initialBooks } from './data'; import { BookCard } from './BookCard';
      export function App() { const [books] = useState(initialBooks); return <ul>{books.map(({ id, title, read }) =>
        <BookCard key={id} book={{ id, title, read }} onToggle={() => undefined} />)}</ul>; }`,
  });
  expect(checked.diagnostics).toEqual([]);
  expect(checked.facts).toEqual({
    definesBookComponent: true,
    ownsReadingState: true,
    usesStableBookKeys: true,
  });
});

it.each([
  ['unused-jsx', false],
  ['alternative-fragment', true],
  ['alternative-copied-book', true],
  ['alternative-fresh-copy', true],
] as const)('%sの表示へ返す部品とStateの経路を確認する', async (fixture, expected) => {
  const root =
    'content/react/chapters/react-ch02/lessons/react-ch02-l02/exercises/react-ch02-l02-e01/fixtures/' +
    fixture;
  const files = Object.fromEntries(
    await Promise.all(
      ['BookCard.tsx', 'components.tsx'].map(
        async (name) => [name, await readFile(root + '/' + name, 'utf8')] as const,
      ),
    ),
  );
  const checked = analyzeReadingList(files);
  expect(checked.diagnostics).toEqual([]);
  expect(checked.facts.definesBookComponent).toBe(expected);
  expect(checked.facts.ownsReadingState).toBe(expected);
});

it('新しくコピーした本への分割代入は、元のStateへの直接変更と区別する', async () => {
  const root =
    'content/react/chapters/react-ch02/lessons/react-ch02-l02/exercises/react-ch02-l02-e01/fixtures/alternative-fresh-copy';
  const files = Object.fromEntries(
    await Promise.all(
      ['BookCard.tsx', 'components.tsx'].map(
        async (name) => [name, await readFile(root + '/' + name, 'utf8')] as const,
      ),
    ),
  );
  files['components.tsx'] = files['components.tsx']!.replace(
    'updated.read = !book.read',
    '({ read: updated.read } = { read: !book.read })',
  );
  const checked = analyzeReadingList(files);
  expect(checked.diagnostics).toEqual([]);
  expect(checked.facts.ownsReadingState).toBe(true);
});

it.each([
  'book.read = !book.read',
  '(book.read) = !book.read',
  '(book.read as boolean) = !book.read',
  'book.read! = !book.read',
  '({ read: book.read } = { read: !book.read })',
  '[book.read] = [!book.read]',
  '({ value: { read: book.read } } = { value: { read: !book.read } })',
])('可変型へコピーしても、State内の本を直接書き換える更新 %s を拒否する', async (target) => {
  const root =
    'content/react/chapters/react-ch02/lessons/react-ch02-l02/exercises/react-ch02-l02-e01/fixtures/mutable-state-book';
  const files = Object.fromEntries(
    await Promise.all(
      ['BookCard.tsx', 'components.tsx'].map(
        async (name) => [name, await readFile(root + '/' + name, 'utf8')] as const,
      ),
    ),
  );
  files['components.tsx'] = files['components.tsx']!.replace('book.read = !book.read', target);
  const checked = analyzeReadingList(files);
  expect(
    checked.diagnostics.some(
      (diagnostic) => diagnostic.file === 'components.tsx' && diagnostic.code === 0,
    ),
  ).toBe(true);
});

it('未使用mapのKeyを、表示する一覧のKeyとして認めない', () => {
  expect(
    keyFact(
      'const unused = books.map((book) => <BookCard key={book.id} book={book} />); return <ul><BookCard book={first} /></ul>;',
    ),
  ).toBe(false);
});
