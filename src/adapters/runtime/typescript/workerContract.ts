import type { TypeScriptCompileResult } from './compileTypeScript';
import type { ScoreNumberAnnotationResult } from './checkScoreNumberAnnotation';
import type { ScoreNumberInferenceResult } from './checkScoreNumberInference';
import type { QuestionInterfaceResult } from './checkQuestionInterface';
import type { ReusableLearningProfile, ReusableLearningResult } from './checkReusableLearning';
import type {
  ConditionalLearningProfile,
  ConditionalLearningResult,
} from './checkConditionalLearning';

export interface TypeScriptCompileInput {
  readonly sessionId: string;
  readonly revision: number;
  readonly files: Readonly<Record<string, string>>;
}

interface WorkerRequestBase {
  readonly requestId: string;
  readonly input: TypeScriptCompileInput;
}

export type CompilerWorkerRequest = WorkerRequestBase &
  (
    | { readonly kind: 'compile' }
    | {
        readonly kind: 'learning-check';
        readonly profile:
          | 'score-number-annotation-v1'
          | 'score-number-inference-v1'
          | 'question-interface-v1'
          | ConditionalLearningProfile
          | ReusableLearningProfile;
      }
  );

/** 学習check結果は有限factだけ。余分な情報や成立しないprobe成功を拒否する。 */
export function isScoreNumberAnnotationResult(
  value: unknown,
): value is ScoreNumberAnnotationResult {
  return isScoreLearningResult(value, 'explicitNumberAnnotation');
}

/** 推論専用factを要求し、注釈Lessonの応答との取り違えを拒否する。 */
export function isScoreNumberInferenceResult(value: unknown): value is ScoreNumberInferenceResult {
  return isScoreLearningResult(value, 'unannotatedLetDeclaration');
}

/** Question専用の有限factだけを受け取り、成立しない正負検査の成功を拒否する。 */
export function isQuestionInterfaceResult(value: unknown): value is QuestionInterfaceResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result['status'] === 'system-error') return Object.keys(result).length === 1;
  if (
    result['status'] !== 'ready' ||
    Object.keys(result).sort().join(',') !== 'facts,status' ||
    !result['facts'] ||
    typeof result['facts'] !== 'object' ||
    Array.isArray(result['facts'])
  )
    return false;
  const facts = result['facts'] as Record<string, unknown>;
  const prerequisites = [
    'programShapeAccepted',
    'interfaceAnnotationAccepted',
    'requiredFieldsAccepted',
    'dataValuesAccepted',
    'forbiddenEscapeAbsent',
    'logsIndexedChoiceLast',
  ];
  const keys = [...prerequisites, 'positiveProbeAccepted', 'negativeProbesRejected'].sort();
  if (
    Object.keys(facts).sort().join(',') !== keys.join(',') ||
    !keys.every((key) => typeof facts[key] === 'boolean')
  )
    return false;
  const eligible = prerequisites.every((key) => facts[key] === true);
  return (
    facts['positiveProbeAccepted'] === eligible &&
    facts['negativeProbesRejected'] === eligible &&
    (!facts['programShapeAccepted'] || facts['logsIndexedChoiceLast'] === true)
  );
}

/** 2課題をprofileで区別し、余分なpayloadや前提と不整合なprobe成功を拒否する。 */
export function isConditionalLearningResult(
  value: unknown,
  profile: ConditionalLearningProfile,
): value is ConditionalLearningResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result['status'] === 'system-error') return Object.keys(result).length === 1;
  if (
    result['status'] !== 'ready' ||
    result['profile'] !== profile ||
    Object.keys(result).sort().join(',') !== 'facts,profile,status' ||
    !result['facts'] ||
    typeof result['facts'] !== 'object' ||
    Array.isArray(result['facts'])
  )
    return false;
  const facts = result['facts'] as Record<string, unknown>;
  const prerequisites = [
    'typeShapeAccepted',
    'parameterAnnotationAccepted',
    'branchesUseValue',
    'callsAccepted',
    'forbiddenEscapeAbsent',
  ];
  const keys = [...prerequisites, 'positiveProbeAccepted', 'negativeProbesRejected'].sort();
  if (
    Object.keys(facts).sort().join(',') !== keys.join(',') ||
    !keys.every((key) => typeof facts[key] === 'boolean')
  )
    return false;
  const eligible = prerequisites.every((key) => facts[key] === true);
  return (
    facts['positiveProbeAccepted'] === eligible && facts['negativeProbesRejected'] === eligible
  );
}

/** 再利用の3課題では要求profileと有限factを照合し、成立しないprobe成功を拒否する。 */
export function isReusableLearningResult(
  value: unknown,
  profile: ReusableLearningProfile,
): value is ReusableLearningResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result['status'] === 'system-error') return Object.keys(result).length === 1;
  if (
    result['status'] !== 'ready' ||
    result['profile'] !== profile ||
    Object.keys(result).sort().join(',') !== 'facts,profile,status' ||
    !result['facts'] ||
    typeof result['facts'] !== 'object' ||
    Array.isArray(result['facts'])
  )
    return false;
  const facts = result['facts'] as Record<string, unknown>;
  const prerequisites = [
    'programShapeAccepted',
    'typeContractAccepted',
    'usesInputValue',
    'callsAccepted',
    'forbiddenEscapeAbsent',
  ];
  const keys = [...prerequisites, 'positiveProbeAccepted', 'negativeProbesRejected'].sort();
  if (
    Object.keys(facts).sort().join(',') !== keys.join(',') ||
    !keys.every((key) => typeof facts[key] === 'boolean')
  )
    return false;
  const eligible = prerequisites.every((key) => facts[key] === true);
  return (
    facts['positiveProbeAccepted'] === eligible && facts['negativeProbesRejected'] === eligible
  );
}

/** 2つの導入Lessonだけの有限fact構造とprobe成功の前提を検査する。 */
function isScoreLearningResult(
  value: unknown,
  declarationFact: 'explicitNumberAnnotation' | 'unannotatedLetDeclaration',
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result['status'] === 'system-error') return Object.keys(result).length === 1;
  if (
    result['status'] !== 'ready' ||
    Object.keys(result).sort().join(',') !== 'facts,status' ||
    !result['facts'] ||
    typeof result['facts'] !== 'object' ||
    Array.isArray(result['facts'])
  )
    return false;
  const facts = result['facts'] as Record<string, unknown>;
  const keys = [
    declarationFact,
    'forbiddenEscapeAbsent',
    'logsScoreLast',
    'negativeProbeRejected',
    'positiveProbeAccepted',
    'programShapeAccepted',
  ].sort();
  if (
    Object.keys(facts).sort().join(',') !== keys.join(',') ||
    !keys.every((key) => typeof facts[key] === 'boolean')
  )
    return false;
  const eligible =
    facts[declarationFact] &&
    facts['forbiddenEscapeAbsent'] &&
    facts['logsScoreLast'] &&
    facts['programShapeAccepted'];
  return (
    facts['positiveProbeAccepted'] === !!eligible &&
    facts['negativeProbeRejected'] === !!eligible &&
    (!facts['programShapeAccepted'] || facts['logsScoreLast'] === true)
  );
}

/** 通常compileとLesson限定checkを曖昧なoptional payloadで混ぜない。 */
export function isCompilerWorkerRequest(value: unknown): value is CompilerWorkerRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const keys =
    request['kind'] === 'compile' ? 'input,kind,requestId' : 'input,kind,profile,requestId';
  return (
    Object.keys(request).sort().join(',') === keys &&
    (request['kind'] === 'compile' ||
      (request['kind'] === 'learning-check' &&
        (request['profile'] === 'score-number-annotation-v1' ||
          request['profile'] === 'score-number-inference-v1' ||
          request['profile'] === 'question-interface-v1' ||
          request['profile'] === 'union-result-v1' ||
          request['profile'] === 'optional-hint-v1' ||
          request['profile'] === 'number-callback-v1' ||
          request['profile'] === 'generic-identity-v1' ||
          request['profile'] === 'readonly-copy-v1'))) &&
    typeof request['requestId'] === 'string' &&
    request['requestId'].length > 0 &&
    request['requestId'].length <= 128 &&
    isTypeScriptCompileInput(request['input'])
  );
}

/** compilerを初期chunkへimportせず、Workerへ渡す文字列Mapとidentityを検証する。 */
export function isTypeScriptCompileInput(value: unknown): value is TypeScriptCompileInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (
    typeof input['sessionId'] !== 'string' ||
    !input['sessionId'] ||
    input['sessionId'].length > 128 ||
    !Number.isSafeInteger(input['revision']) ||
    Number(input['revision']) < 0 ||
    !input['files'] ||
    typeof input['files'] !== 'object' ||
    Array.isArray(input['files'])
  )
    return false;
  const files = Object.entries(input['files']);
  return (
    files.length > 0 &&
    files.length <= 16 &&
    files.every(
      ([name, source]) =>
        name.length <= 256 &&
        /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/u.test(name) &&
        typeof source === 'string',
    ) &&
    files.reduce((size, [, source]) => size + (source as string).length, 0) <= 131_072
  );
}

/** Worker結果はplain dataの成功/診断に限定し、出力pathと件数も入力に対応させる。 */
export function isTypeScriptCompileResult(
  value: unknown,
  input: TypeScriptCompileInput,
): value is TypeScriptCompileResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const expectedKeys =
    result['status'] === 'ready' ? ['files', 'sourceMaps', 'status'] : ['diagnostics', 'status'];
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(expectedKeys)) return false;
  if (result['status'] === 'ready') {
    if (!result['files'] || typeof result['files'] !== 'object' || Array.isArray(result['files']))
      return false;
    if (
      !result['sourceMaps'] ||
      typeof result['sourceMaps'] !== 'object' ||
      Array.isArray(result['sourceMaps'])
    )
      return false;
    const maps = Object.entries(result['sourceMaps']);
    const files = Object.entries(result['files']);
    const expected = new Set(Object.keys(input.files).map((name) => name.replace(/\.ts$/u, '.js')));
    return (
      maps.length === expected.size &&
      maps.every(([name, text]) => expected.has(name) && typeof text === 'string') &&
      maps.reduce((size, [, text]) => size + (text as string).length, 0) <= 4_194_304 &&
      files.length === expected.size &&
      files.every(
        ([name, text]) =>
          expected.has(name) && typeof text === 'string' && text.length <= 1_048_576,
      )
    );
  }
  if (
    !['invalid-input', 'environment-error', 'syntax-error', 'type-error'].includes(
      String(result['status']),
    ) ||
    !Array.isArray(result['diagnostics']) ||
    !result['diagnostics'].length ||
    result['diagnostics'].length > 51
  )
    return false;
  return result['diagnostics'].every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const diagnostic = item as Record<string, unknown>;
    return (
      Number.isSafeInteger(diagnostic['code']) &&
      typeof diagnostic['message'] === 'string' &&
      diagnostic['message'].length <= 2_000 &&
      (diagnostic['file'] === undefined ||
        (typeof diagnostic['file'] === 'string' && diagnostic['file'].length <= 256)) &&
      ['line', 'column'].every(
        (key) =>
          diagnostic[key] === undefined ||
          (Number.isSafeInteger(diagnostic[key]) && Number(diagnostic[key]) > 0),
      )
    );
  });
}
