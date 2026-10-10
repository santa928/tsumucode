import { Buffer } from 'node:buffer';
import { pythonLessonAnalysis } from './python-lesson-analysis.mjs';
import { PYTHON_VERSION, PYTHON_IMAGE } from './protocol.mjs';
export {
  PYTHON_EXERCISE_ID,
  PYTHON_PROFILE_ID,
  PYTHON_IMAGE,
  PYTHON_VERSION,
} from './protocol.mjs';

const bootstrap = `
import base64
import json
import os
import sys
files = json.loads(base64.b64decode("".join(sys.argv[1:])).decode("utf-8"))
with open("/workspace/main.py", "xb") as output:
    output.write(files["main.py"].encode("utf-8"))
os.execv(sys.executable, [sys.executable, "-I", "-S", "-B", "-u", "/workspace/main.py"])
`;
const lessonProgram = pythonLessonAnalysis('TSUMUCODE_SOURCE').replace(
  '"TSUMUCODE_SOURCE"',
  '_source',
);
const analysis = `
import base64
import json
import sys
_source = base64.b64decode("".join(sys.argv[1:])).decode("utf-8")
try:
${lessonProgram
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')}
except SyntaxError:
    _lesson_supported = False
    _lesson_printed = set()
    _lesson_added = set()
print(json.dumps({
    "version": sys.version.split()[0],
    "supported": _lesson_supported,
    "numericVariablePrinted": bool(_lesson_printed),
    "sameVariableAdditionPrinted": bool(_lesson_printed & _lesson_added),
}))
`;

/** 固定CPythonと固定programだけを選び、長いsourceはshellを使わずargvへ分割する。 */
export function pythonCommand(files, analyze = false) {
  const input = analyze ? files['main.py'] : JSON.stringify(files);
  return {
    Image: PYTHON_IMAGE,
    Entrypoint: ['python'],
    Cmd: [
      '-I',
      '-S',
      '-B',
      '-u',
      '-c',
      analyze ? analysis : bootstrap,
      ...(Buffer.from(input)
        .toString('base64')
        .match(/.{1,16384}/gu) ?? []),
    ],
  };
}

/** 学習コードを一度も実行しない解析containerの正常packetだけを信用する。 */
export function parsePythonAnalysis(stdout, stderr, exitCode) {
  if (exitCode !== 0 || stderr !== '') throw new Error('CPython AST解析が失敗しました');
  const value = JSON.parse(stdout);
  const keys = ['version', 'supported', 'numericVariablePrinted', 'sameVariableAdditionPrinted'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    value.version !== PYTHON_VERSION ||
    keys.slice(1).some((key) => typeof value[key] !== 'boolean')
  ) {
    throw new Error('CPython AST解析の版またはfactsが不正です');
  }
  return value;
}
