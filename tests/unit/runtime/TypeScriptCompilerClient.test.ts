import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TypeScriptCompilerClient,
  type CompilerWorkerPort,
} from '../../../src/adapters/runtime/typescript/TypeScriptCompilerClient';
import {
  isCompilerWorkerRequest,
  type CompilerWorkerRequest,
} from '../../../src/adapters/runtime/typescript/workerContract';

/** Workerを走らせず、遅延・古い応答・基盤故障だけを再現する契約用port。 */
class FakeWorker implements CompilerWorkerPort {
  onmessage: CompilerWorkerPort['onmessage'] = null;
  onerror: CompilerWorkerPort['onerror'] = null;
  onmessageerror: CompilerWorkerPort['onmessageerror'] = null;
  request: CompilerWorkerRequest | undefined;
  terminate = vi.fn();
  postMessage(request: CompilerWorkerRequest): void {
    this.request = request;
  }
  /** 通常の応答identityを再現し、改変した応答も注入する。 */
  respond(overrides: Record<string, unknown> = {}): void {
    this.onmessage?.({
      data: {
        kind: this.request?.kind,
        requestId: this.request?.requestId,
        sessionId: this.request?.input.sessionId,
        revision: this.request?.input.revision,
        result: {
          status: 'ready',
          files: { 'main.js': 'const count = 1;' },
          sourceMaps: { 'main.js': '{}' },
        },
        ...overrides,
      },
    } as MessageEvent<unknown>);
  }
}

const input = {
  sessionId: 'lesson-ts',
  revision: 1,
  files: { 'main.ts': 'const count: number = 1;' },
};
afterEach(() => {
  vi.useRealTimers();
});

describe('TypeScriptCompilerClient', () => {
  const facts = {
    programShapeAccepted: true,
    explicitNumberAnnotation: true,
    forbiddenEscapeAbsent: true,
    logsScoreLast: true,
    positiveProbeAccepted: true,
    negativeProbeRejected: true,
  };

  it.each(['union-result-v1', 'optional-hint-v1'] as const)(
    '分岐の%sで世代と応答profileを照合する',
    async (profile) => {
      const worker = new FakeWorker();
      const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
      const facts = {
        typeShapeAccepted: true,
        parameterAnnotationAccepted: true,
        branchesUseValue: true,
        callsAccepted: true,
        forbiddenEscapeAbsent: true,
        positiveProbeAccepted: true,
        negativeProbesRejected: true,
      };
      const result = client.conditionalCheck({ ...input, revision: 2 }, profile);
      expect(worker.request).toMatchObject({
        kind: 'learning-check',
        profile,
        input: { revision: 2 },
      });
      expect(isCompilerWorkerRequest(worker.request)).toBe(true);
      worker.respond({ revision: 1, result: { status: 'ready', profile, facts } });
      expect(worker.terminate).not.toHaveBeenCalled();
      worker.respond({ result: { status: 'ready', profile, facts } });
      await expect(result).resolves.toEqual({ status: 'ready', profile, facts });
      const other = client.conditionalCheck({ ...input, revision: 3 }, profile);
      worker.respond({
        result: {
          status: 'ready',
          profile: profile === 'union-result-v1' ? 'optional-hint-v1' : 'union-result-v1',
          facts,
        },
      });
      await expect(other).resolves.toEqual({ status: 'system-error' });
      client.dispose();
    },
  );

  it.each(['number-callback-v1', 'generic-identity-v1', 'readonly-copy-v1'] as const)(
    '再利用の%sで世代と応答profileを照合する',
    async (profile) => {
      const worker = new FakeWorker();
      const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
      const facts = {
        programShapeAccepted: true,
        typeContractAccepted: true,
        usesInputValue: true,
        callsAccepted: true,
        forbiddenEscapeAbsent: true,
        positiveProbeAccepted: true,
        negativeProbesRejected: true,
      };
      const result = client.reusableCheck({ ...input, revision: 2 }, profile);
      expect(worker.request).toMatchObject({
        kind: 'learning-check',
        profile,
        input: { revision: 2 },
      });
      expect(isCompilerWorkerRequest(worker.request)).toBe(true);
      worker.respond({ revision: 1, result: { status: 'ready', profile, facts } });
      expect(worker.terminate).not.toHaveBeenCalled();
      worker.respond({ result: { status: 'ready', profile, facts } });
      await expect(result).resolves.toEqual({ status: 'ready', profile, facts });
      const other = client.reusableCheck({ ...input, revision: 3 }, profile);
      worker.respond({
        result: {
          status: 'ready',
          profile: profile === 'number-callback-v1' ? 'generic-identity-v1' : 'number-callback-v1',
          facts,
        },
      });
      await expect(other).resolves.toEqual({ status: 'system-error' });
      client.dispose();
    },
  );

  it.each(['dom-event-v1', 'unknown-points-v1', 'async-unknown-v1'] as const)(
    '境界課題の%sで世代と応答profileを照合する',
    async (profile) => {
      const worker = new FakeWorker();
      const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
      const facts = {
        programShapeAccepted: true,
        typeContractAccepted: true,
        usesInputValue: true,
        callsAccepted: true,
        forbiddenEscapeAbsent: true,
        positiveProbeAccepted: true,
        negativeProbesRejected: true,
      };
      const result = client.boundaryCheck({ ...input, revision: 2 }, profile);
      expect(worker.request).toMatchObject({
        kind: 'learning-check',
        profile,
        input: { revision: 2 },
      });
      expect(isCompilerWorkerRequest(worker.request)).toBe(true);
      worker.respond({ revision: 1, result: { status: 'ready', profile, facts } });
      expect(worker.terminate).not.toHaveBeenCalled();
      worker.respond({ result: { status: 'ready', profile, facts } });
      await expect(result).resolves.toEqual({ status: 'ready', profile, facts });
      const other = client.boundaryCheck({ ...input, revision: 3 }, profile);
      worker.respond({
        result: {
          status: 'ready',
          profile: profile === 'dom-event-v1' ? 'unknown-points-v1' : 'dom-event-v1',
          facts,
        },
      });
      await expect(other).resolves.toEqual({ status: 'system-error' });
      client.dispose();
    },
  );

  it.each(['quiz-data-v1', 'quiz-state-v1', 'quiz-boundary-v1'] as const)(
    '制作の%sで世代・応答profile・余分なpayloadを照合する',
    async (profile) => {
      const worker = new FakeWorker();
      const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
      const facts = {
        programShapeAccepted: true,
        typeContractAccepted: true,
        usesLearningValues: true,
        forbiddenEscapeAbsent: true,
        positiveProbeAccepted: true,
        negativeProbesRejected: true,
      };
      const result = client.quizProjectCheck({ ...input, revision: 2 }, profile);
      expect(isCompilerWorkerRequest(worker.request)).toBe(true);
      worker.respond({ revision: 1, result: { status: 'ready', profile, facts } });
      expect(worker.terminate).not.toHaveBeenCalled();
      worker.respond({ result: { status: 'ready', profile, facts } });
      await expect(result).resolves.toEqual({ status: 'ready', profile, facts });
      const other = client.quizProjectCheck({ ...input, revision: 3 }, profile);
      worker.respond({ result: { status: 'ready', profile, facts, files: {} } });
      await expect(other).resolves.toEqual({ status: 'system-error' });
      const wrong = client.quizProjectCheck({ ...input, revision: 4 }, profile);
      worker.respond({
        result: {
          status: 'ready',
          profile: profile === 'quiz-data-v1' ? 'quiz-state-v1' : 'quiz-data-v1',
          facts,
        },
      });
      await expect(wrong).resolves.toEqual({ status: 'system-error' });
      client.dispose();
    },
  );

  it('Question専用profileで古い世代を無視し、別profileのfactを拒否する', async () => {
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const questionFacts = {
      programShapeAccepted: true,
      interfaceAnnotationAccepted: true,
      requiredFieldsAccepted: true,
      dataValuesAccepted: true,
      forbiddenEscapeAbsent: true,
      logsIndexedChoiceLast: true,
      positiveProbeAccepted: true,
      negativeProbesRejected: true,
    };
    const result = client.questionCheck({ ...input, revision: 2 });
    expect(worker.request).toMatchObject({
      kind: 'learning-check',
      profile: 'question-interface-v1',
      input: { revision: 2 },
    });
    expect(isCompilerWorkerRequest(worker.request)).toBe(true);
    worker.respond({ revision: 1, result: { status: 'ready', facts: questionFacts } });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.respond({ result: { status: 'ready', facts: questionFacts } });
    await expect(result).resolves.toEqual({ status: 'ready', facts: questionFacts });
    const next = client.questionCheck({ ...input, revision: 3 });
    worker.respond({ result: { status: 'ready', facts } });
    await expect(next).resolves.toEqual({ status: 'system-error' });
    client.dispose();
  });

  it('型推論profileを送信し、型注釈の応答を受け入れない', async () => {
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const result = client.inferenceCheck(input);
    expect(worker.request).toMatchObject({
      kind: 'learning-check',
      profile: 'score-number-inference-v1',
    });
    expect(isCompilerWorkerRequest(worker.request)).toBe(true);
    worker.respond({ result: { status: 'ready', facts } });
    await expect(result).resolves.toEqual({ status: 'system-error' });
    const retry = client.inferenceCheck(input);
    const inferenceFacts = {
      programShapeAccepted: true,
      forbiddenEscapeAbsent: true,
      logsScoreLast: true,
      positiveProbeAccepted: true,
      negativeProbeRejected: true,
      unannotatedLetDeclaration: true,
    };
    worker.respond({ result: { status: 'ready', facts: inferenceFacts } });
    await expect(retry).resolves.toEqual({ status: 'ready', facts: inferenceFacts });
    client.dispose();
  });

  it('学習検査の操作とsnapshotを固定し、通常compileの応答と混ぜない', async () => {
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const result = client.learningCheck(input);
    expect(worker.request).toMatchObject({
      kind: 'learning-check',
      profile: 'score-number-annotation-v1',
    });
    expect(isCompilerWorkerRequest(worker.request)).toBe(true);
    worker.respond({ result: { status: 'ready', facts } });
    await expect(result).resolves.toEqual({ status: 'ready', facts });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    { kind: 'compile', result: { status: 'ready', facts } },
    { result: { status: 'ready', facts: { ...facts, logsScoreLast: false } } },
    { result: { status: 'ready', facts: { ...facts, unknown: true } } },
    { result: { status: 'ready', facts: { ...facts, explicitNumberAnnotation: 1 } } },
    { result: { status: 'ready', facts }, diagnostics: [] },
    { result: { status: 'system-error', facts } },
  ])('学習検査の不正・混在応答を未採点にする %j', async (response) => {
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const result = client.learningCheck(input);
    worker.respond(response);
    await expect(result).resolves.toEqual({ status: 'system-error' });
  });

  it('学習checkも古い世代を無視し、期限で破棄し、新compileで置換できる', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker, deadlineMs: 10 });
    const result = client.learningCheck(input);
    worker.respond({ revision: 0, result: { status: 'ready', facts } });
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toEqual({ status: 'system-error' });
    const old = client.learningCheck(input).catch((error: unknown) => error);
    const next = client.compile(input);
    await expect(old).resolves.toMatchObject({ name: 'AbortError' });
    worker.respond();
    await expect(next).resolves.toMatchObject({ status: 'ready' });
    client.dispose();
  });

  it('未知profile・余分なrequest項目・操作省略を拒否する', () => {
    for (const request of [
      { kind: 'learning-check', profile: 'unknown', requestId: '1', input },
      { kind: 'compile', requestId: '1', input, profile: 'score-number-annotation-v1' },
      { requestId: '1', input },
    ])
      expect(isCompilerWorkerRequest(request)).toBe(false);
  });
  it('初回要求までWorkerを作らず、元sourceを保持し同identityの応答だけ受理する', async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const client = new TypeScriptCompilerClient({ workerFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    const source = { ...input, files: { ...input.files } };
    const result = client.compile(source);
    source.files['main.ts'] = '編集後';
    expect(worker.request?.input.files['main.ts']).toBe(input.files['main.ts']);
    worker.respond({ revision: 0 });
    worker.respond({ sessionId: 'another-session' });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.respond();
    await expect(result).resolves.toMatchObject({ status: 'ready' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('新要求は旧Workerを中止し、旧callbackは新要求へ影響しない', async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    const client = new TypeScriptCompilerClient({ workerFactory: () => workers.shift()! });
    const firstWorker = workers[0]!;
    const secondWorker = workers[1]!;
    const first = client.compile(input).catch((error: unknown) => error);
    const lateError = firstWorker.onerror;
    const second = client.compile({ ...input, revision: 2 });
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expect(await first).toMatchObject({ name: 'AbortError' });
    lateError?.({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    expect(secondWorker.terminate).not.toHaveBeenCalled();
    secondWorker.respond();
    await expect(second).resolves.toMatchObject({ status: 'ready' });
  });

  it('時間切れはWorkerをterminateして環境障害にし、新Workerで再試行できる', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker, deadlineMs: 50 });
    const result = client.compile(input);
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toMatchObject({ status: 'environment-error' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const retry = client.compile(input);
    worker.respond();
    await expect(retry).resolves.toMatchObject({ status: 'ready' });
  });

  it('中止/離脱はAbortErrorで終わり、離脱後の要求を起動しない', async () => {
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const pending = client.compile(input).catch((error: unknown) => error);
    client.cancel();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    client.dispose();
    client.dispose();
    await expect(client.compile(input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('Worker作成/転送/復号失敗と不正な出力を環境障害に分離する', async () => {
    const creation = new TypeScriptCompilerClient({
      workerFactory: () => {
        throw new Error('unavailable');
      },
    });
    await expect(creation.compile(input)).resolves.toMatchObject({ status: 'environment-error' });
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const invalid = client.compile(input);
    worker.respond({
      result: {
        status: 'ready',
        files: { '../other.js': 'invalid' },
        sourceMaps: { 'main.js': '{}' },
      },
    });
    await expect(invalid).resolves.toMatchObject({ status: 'environment-error' });
    for (const sourceMaps of [
      undefined,
      { 'other.js': '{}' },
      { 'main.js': 'x'.repeat(4_194_305) },
    ]) {
      const invalidMap = client.compile(input);
      worker.respond({
        result: { status: 'ready', files: { 'main.js': 'console.log(1);' }, sourceMaps },
      });
      await expect(invalidMap).resolves.toMatchObject({ status: 'environment-error' });
    }
    const mixed = client.compile(input);
    worker.respond({
      result: {
        status: 'type-error',
        diagnostics: [{ code: 1, message: '型不一致' }],
        files: { 'main.js': 'unexpected' },
      },
    });
    await expect(mixed).resolves.toMatchObject({ status: 'environment-error' });
    const decode = client.compile(input);
    worker.onmessageerror?.({} as MessageEvent<unknown>);
    await expect(decode).resolves.toMatchObject({ status: 'environment-error' });
    worker.postMessage = () => {
      throw new Error('clone');
    };
    await expect(client.compile(input)).resolves.toMatchObject({ status: 'environment-error' });
  });

  it('不正な新入力でも旧計算を中止し、Workerへ渡さない', async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const client = new TypeScriptCompilerClient({ workerFactory: factory });
    const previous = client.compile(input).catch((error: unknown) => error);
    await expect(
      client.compile({ ...input, files: { '../outside.ts': '' } }),
    ).resolves.toMatchObject({ status: 'invalid-input' });
    expect(await previous).toMatchObject({ name: 'AbortError' });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
