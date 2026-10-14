import { Buffer } from 'node:buffer';
import { pythonLessonAnalysis } from './python-lesson-analysis.mjs';
import { pythonModuleAnalysis, parsePythonModuleAnalysis } from './pythonModuleAnalysis.mjs';
import {
  isPythonModuleProfile,
  isPythonObjectProtocolProfile,
  isPythonDecoratorProfile,
  isPythonDecoratorFactoryProfile,
  isPythonOopProfile,
} from './pythonLessonProfiles.mjs';
import { PYTHON_VERSION, PYTHON_IMAGE } from './protocol.mjs';
export {
  PYTHON_EXERCISE_ID,
  PYTHON_PROFILE_ID,
  PYTHON_IMAGE,
  PYTHON_VERSION,
} from './protocol.mjs';

const factoryFields = ['configuredDecoratorCompared', 'decoratorProjectRecorded'];
const decoratorFields = ['decoratorFlowCompared', 'wrapsMetadataPreserved'];
const oopFields = ['classInstanceCompared', 'methodsCompared'];
const objectProtocolFields = [
  'inheritanceDelegationCompared',
  'propertyRangeValidated',
  'dunderProtocolsUsed',
];

const dataProfiles = new Set([
  'list-reference-sum-v1',
  'dict-value-sum-v1',
  'function-return-scope-v1',
]);
const dataFields = ['listReferenceSummed', 'dictValuesSummed', 'functionReturnScoped'];
const iterationProfiles = new Set([
  'list-comprehension-filter-v1',
  'iterator-consumption-v1',
  'generator-lifecycle-v1',
]);
const iterationFields = ['listComprehensionFiltered', 'iteratorConsumed', 'generatorLifecycle'];

const bootstrap = `
import base64
import json
import os
import sys
payload = json.loads(base64.b64decode("".join(sys.argv[1:])).decode("utf-8"))
files = payload["files"]
with open("/workspace/.stdin", "xb") as stdin_file:
    stdin_file.write(("\\n".join(payload["inputLines"]) + ("\\n" if payload["inputLines"] else "")).encode("utf-8"))
stdin_fd = os.open("/workspace/.stdin", os.O_RDONLY)
os.dup2(stdin_fd, 0)
os.close(stdin_fd)
with open("/workspace/main.py", "xb") as output:
    output.write(files["main.py"].encode("utf-8"))
if payload["module"]:
    with open("/workspace/lesson_tools.py", "xb") as output:
        output.write(files["lesson_tools.py"].encode("utf-8"))
    launcher = 'import sys; sys.path.insert(0, "/workspace"); source = open("/workspace/main.py", "rb").read(); exec(compile(source, "/workspace/main.py", "exec"), {"__name__": "__main__", "__file__": "/workspace/main.py"})'
    os.execv(sys.executable, [sys.executable, "-I", "-S", "-B", "-u", "-c", launcher])
os.execv(sys.executable, [sys.executable, "-I", "-S", "-B", "-u", "/workspace/main.py"])
`;
/** 教材profileは固定IDから決定し、解析結果は学習者stdoutと分離する。 */
function analysisProgram(profile) {
  if (isPythonModuleProfile(profile)) {
    const program = pythonModuleAnalysis({}, profile)
      .replace('_json.loads("{}")', '_payload["files"]')
      .replace('_json.loads("[]")', '_payload["inputLines"]')
      .replace('_json.dumps(_analyze())', '_module_result = _analyze()');
    return `
import base64
import json
import sys
_payload = json.loads(base64.b64decode("".join(sys.argv[1:])).decode("utf-8"))
${program}
_module_result["version"] = sys.version.split()[0]
print(json.dumps(_module_result))
`;
  }
  const program = pythonLessonAnalysis('TSUMUCODE_SOURCE', profile)
    .replace('"TSUMUCODE_SOURCE"', '_source')
    .replace('_lesson_json.dumps({', '_lesson_result = _lesson_json.dumps({');
  const fallback = {
    supported: false,
    numericVariablePrinted: false,
    sameVariableAdditionPrinted: false,
  };
  if (isPythonOopProfile(profile))
    Object.assign(
      fallback,
      Object.fromEntries(
        (isPythonDecoratorFactoryProfile(profile)
          ? factoryFields
          : isPythonDecoratorProfile(profile)
            ? decoratorFields
            : isPythonObjectProtocolProfile(profile)
              ? objectProtocolFields
              : oopFields
        ).map((field) => [field, false]),
      ),
    );
  else if (profile === 'dataclass-test-project-v1') fallback.dataProjectTested = false;
  else if (profile === 'context-manager-close-v1') fallback.contextManagedClosed = false;
  else if (iterationProfiles.has(profile))
    Object.assign(fallback, Object.fromEntries(iterationFields.map((field) => [field, false])));
  else if (dataProfiles.has(profile))
    Object.assign(fallback, Object.fromEntries(dataFields.map((field) => [field, false])));
  else if (profile !== 'values-vars-print-v1')
    Object.assign(fallback, {
      inputEchoed: false,
      ageBoundaryBranched: false,
      rangeIterated: false,
    });
  return `
import base64
import json
import sys
_source = base64.b64decode("".join(sys.argv[1:])).decode("utf-8")
try:
${program
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')}
    _result = json.loads(_lesson_result)
${isPythonOopProfile(profile) ? '    _result["syntaxError"] = False' : ''}
except SyntaxError:
    _result = json.loads(${JSON.stringify(JSON.stringify(fallback))})
${isPythonOopProfile(profile) ? '    _result["syntaxError"] = True' : ''}
_result["version"] = sys.version.split()[0]
print(json.dumps(_result))
`;
}

/** 固定CPythonと固定programだけを選び、長いsourceはshellを使わずargvへ分割する。 */
export function pythonCommand(
  files,
  analyze = false,
  profile = 'values-vars-print-v1',
  inputLines = [],
) {
  const module = isPythonModuleProfile(profile);
  const input =
    analyze && !module ? files['main.py'] : JSON.stringify({ files, inputLines, module });
  return {
    Image: PYTHON_IMAGE,
    Entrypoint: ['python'],
    Cmd: [
      '-I',
      '-S',
      '-B',
      '-u',
      '-c',
      analyze ? analysisProgram(profile) : bootstrap,
      ...(Buffer.from(input)
        .toString('base64')
        .match(/.{1,16384}/gu) ?? []),
    ],
  };
}

/** 学習コードを一度も実行しない解析containerの正常packetだけを信用する。 */
export function parsePythonAnalysis(stdout, stderr, exitCode, profile = 'values-vars-print-v1') {
  if (exitCode !== 0 || stderr !== '') throw new Error('CPython AST解析が失敗しました');
  const value = JSON.parse(stdout);
  if (isPythonModuleProfile(profile)) {
    if (value?.version !== PYTHON_VERSION) throw new Error('CPythonの版が一致しません');
    const { version, ...packet } = value;
    return { ...parsePythonModuleAnalysis(packet), version };
  }
  const keys = ['version', 'supported', 'numericVariablePrinted', 'sameVariableAdditionPrinted'];
  if (isPythonOopProfile(profile))
    keys.push(
      ...(isPythonDecoratorFactoryProfile(profile)
        ? factoryFields
        : isPythonDecoratorProfile(profile)
          ? decoratorFields
          : isPythonObjectProtocolProfile(profile)
            ? objectProtocolFields
            : oopFields),
      'syntaxError',
    );
  else if (profile === 'dataclass-test-project-v1') keys.push('dataProjectTested');
  else if (profile === 'context-manager-close-v1') keys.push('contextManagedClosed');
  else if (iterationProfiles.has(profile)) keys.push(...iterationFields);
  else if (dataProfiles.has(profile)) keys.push(...dataFields);
  else if (profile !== 'values-vars-print-v1')
    keys.push('inputEchoed', 'ageBoundaryBranched', 'rangeIterated');
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
