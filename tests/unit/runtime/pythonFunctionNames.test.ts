// @vitest-environment node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, expect, it } from 'vitest';
import { pythonLessonAnalysis } from '../../../src/core/runtime/pythonLessonAnalysis.mjs';

interface Interpreter {
  runPython(source: string): unknown;
}
let interpreter: Interpreter;
beforeAll(async () => {
  const directory = path.resolve('vendor/python/314.0.7');
  const module = (await import(pathToFileURL(path.join(directory, 'pyodide.mjs')).href)) as {
    loadPyodide(options: { indexURL: string }): Promise<Interpreter>;
  };
  interpreter = await module.loadPyodide({ indexURL: directory + '/' });
}, 60_000);

/** 実際の固定Python ASTで検査する。学習者Source自体の実行や合格判定は別のRunner確認へ残す。 */
function analyze(
  source: string,
  profile: Parameters<typeof pythonLessonAnalysis>[1] = 'function-result-v1',
): { supported: boolean; functionBehaviorVerified: boolean } {
  const result = interpreter.runPython(pythonLessonAnalysis(source, profile));
  if (typeof result !== 'string') throw Error('Python analysis did not return JSON');
  return JSON.parse(result) as { supported: boolean; functionBehaviorVerified: boolean };
}

const ordinary = `def add(left, right):
    return left + right
result = add(3, 5)
print(result + 2)
print(add(4, 6) + 2)
`;

const earlyStops = [
  'def marker():\n    return 0\ndef marker():\n    return 0\n',
  'def marker():\n    return 0\nmarker\n',
  "label = 'a' + 'b'\n",
];

it.each(earlyStops)('解析途中停止で、以前は組込名予約が拒否した呼出しを解禁しない %#', (prefix) => {
  const source = prefix + "eval('40 + 2')\ndef eval(text):\n    return 0\n" + ordinary;
  expect(analyze(source)).toMatchObject({
    supported: false,
    functionBehaviorVerified: false,
  });
});

it.each(earlyStops)('解析途中停止だけで、既存の通常名の未達分類を変更しない %#', (prefix) => {
  expect(analyze(prefix + ordinary)).toMatchObject({
    supported: true,
    functionBehaviorVerified: false,
  });
});

it.each(['sum = 0\n', 'def unused(sum):\n    return 0\n'])(
  '関数名以外の旧予約名の束縛も、解析の途中停止で解禁しない %#',
  (binding) => {
    const source =
      "label = 'a' + 'b'\n" +
      binding +
      "operation = eval\noperation('40 + 2')\ndef operation(value):\n    return 0\n" +
      ordinary;
    expect(analyze(source)).toMatchObject({
      supported: false,
      functionBehaviorVerified: false,
    });
  },
);

it.each(['sum', 'eval'])('明示した自作%s関数の戻り値を検査する', (name) => {
  const source = ordinary.replaceAll('add', name);
  expect(analyze(source)).toMatchObject({ supported: true, functionBehaviorVerified: true });
});

it('正しい戻り値を組込名と同じ変数へ保存する別解を保つ', () => {
  expect(analyze(ordinary.replaceAll('result', 'sum'))).toMatchObject({
    supported: true,
    functionBehaviorVerified: true,
  });
});

it('組込名と同じ引数も、その場で受け取った整数として検査する', () => {
  const source = ordinary.replace(
    'def add(left, right):\n    return left + right',
    'def add(sum, right):\n    return sum + right',
  );
  expect(analyze(source)).toMatchObject({ supported: true, functionBehaviorVerified: true });
});

it('呼出しより前に定義した補助関数へ委ねる別解を保つ', () => {
  const source = `def add(left, right):
    return helper(left, right)
def helper(first, second):
    return first + second
result = add(3, 5)
print(result + 2)
print(add(4, 6) + 2)
`;
  expect(analyze(source)).toMatchObject({ supported: true, functionBehaviorVerified: true });
});

it.each([
  "eval('1 + 2')\ndef eval(text):\n    return 0\n",
  "operation = eval\noperation('1 + 2')\ndef operation(text):\n    return 0\n",
  "def trigger():\n    return eval('1 + 2')\ntrigger()\ndef eval(text):\n    return 0\n",
  'def ignore(value):\n    return 0\nignore(eval)\n',
  "def run(operation):\n    operation(eval('40 + 2'))\nrun(0)\ndef operation(value):\n    return 0\ndef eval(text):\n    return 0\n",
])('未束縛の組込関数を後の自作定義で正当化しない %#', (prefix) => {
  expect(analyze(prefix + ordinary)).toMatchObject({
    supported: false,
    functionBehaviorVerified: false,
  });
});

it('関数名を数値の引数で隠した呼出しを正しい加算の証拠にしない', () => {
  const source = `def add(left, right):
    return left + right
def run(add, left, right):
    return add(left, right)
result = run(1, 3, 5)
print(result + 2)
print(run(1, 4, 6) + 2)
`;
  expect(analyze(source)).toMatchObject({ supported: true, functionBehaviorVerified: false });
});

it('組込名と同じ引数を含む未検証の呼出しを実行対象へ戻さない', () => {
  const source = 'def run(eval):\n    eval(1)\nrun(0)\ndef eval(value):\n    return 0\n' + ordinary;
  // この命名は旧実装でも予約されていた。通常名のscalar対照例とは区別する。
  expect(analyze(source)).toMatchObject({ supported: false, functionBehaviorVerified: false });
});

it.each([ordinary.replaceAll('add', 'print'), ordinary.replaceAll('add', '_hidden')])(
  '表示関数と内部名の再定義を認めない',
  (source) => {
    expect(analyze(source).supported).toBe(false);
  },
);

it.each([
  {
    profile: 'function-call-v1',
    source: 'def sum():\n    print(8)\nsum()\nsum()\n',
  },
  {
    profile: 'function-arguments-v1',
    source: 'def sum(left, right):\n    print(left + right)\nsum(3, 5)\nsum(4, 6)\n',
  },
  {
    profile: 'function-print-return-v1',
    source:
      'def show(left, right):\n    print(left + right)\ndef sum(left, right):\n    return left + right\nvalue = show(3, 5)\nprint(value)\nprint(sum(3, 5))\n',
  },
  {
    profile: 'function-scope-v2',
    source:
      'left = 100\ndef sum(left, right):\n    return left + right\nprint(sum(3, 5))\nprint(sum(4, 6))\nprint(left)\n',
  },
] as const)('他の段階でも定義した同名関数を使える: $profile', ({ source, profile }) => {
  expect(analyze(source, profile)).toMatchObject({
    supported: true,
    functionBehaviorVerified: true,
  });
});
