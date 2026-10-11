import { restrictPythonWorker } from './pythonCapabilities';
import { pythonLessonAnalysis } from './pythonLessonAnalysis';
import { PYTHON_LIMITS, type PythonResult } from './pythonProtocol';
import {
  PYTHON_LESSONS,
  validPythonInputLines,
  validPythonFiles,
  isPythonModuleProfile,
} from '../../../core/runtime/pythonLessonProfiles.mjs';
import type { PythonLessonProfile } from '../../../core/runtime/pythonLessonProfiles.mjs';
import {
  pythonModuleAnalysis,
  parsePythonModuleAnalysis,
} from '../../../core/runtime/pythonModuleAnalysis.mjs';

interface PyodideRuntime {
  FS: { mkdir(path: string): void; writeFile(path: string, source: string): void };
  runPython(source: string, options?: { globals: unknown }): unknown;
  setStdout(options: { write(bytes: Uint8Array): number }): void;
  setStderr(options: { write(bytes: Uint8Array): number }): void;
  setStdin(options: { stdin(): string | null }): void;
}
type PyodideLoader = (options: Record<string, unknown>) => Promise<PyodideRuntime>;

/** 固定coreをclassic Workerへbundleする作者用entry。診断時だけ教材policyを迂回できる。 */
export function initializePythonWorker(
  loadPyodide: PyodideLoader,
  createModule: unknown,
  enforceLessonPolicy = true,
): void {
  const root = self;
  const response = Response;
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);
  const compile = WebAssembly.compile.bind(WebAssembly);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- private portだけをreceiverにする。
  const post = MessagePort.prototype.postMessage;
  const apply = Reflect.apply.bind(Reflect);
  const decoder = TextDecoder;
  const urlConstructor = URL;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- native URLのinternal slotだけを読む。
  const urlHref = Object.getOwnPropertyDescriptor(URL.prototype, 'href')!.get!;
  const encoder = new TextEncoder();
  const encode = encoder.encode.bind(encoder);
  const schedule = setTimeout.bind(root);
  let asynchronousFault = false;
  root.addEventListener('error', () => {
    asynchronousFault = true;
  });
  root.addEventListener('unhandledrejection', () => {
    asynchronousFault = true;
  });
  let accepted = false;
  root.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!event.isTrusted || accepted || event.ports.length !== 1) return;
    accepted = true;
    const port = event.ports[0]!;
    const send = (value: unknown): void => {
      apply(post, port, [value]);
    };
    void run(event.data, send);
  });

  /** 信頼frameからの固定bytesだけを受け、native fetchをloaderにも渡さない。 */
  async function run(input: unknown, send: (value: unknown) => void): Promise<void> {
    let stdout = '';
    let stderr = '';
    const rows: { level: 'log' | 'error'; text: string }[] = [];
    let totalBytes = 0;
    const outputState = { limited: false };
    let prepared = false;
    let learnerExecuting = false;
    let moduleProfile = false;
    let version: string | undefined;
    let writeStderr: ((bytes: Uint8Array) => number) | undefined;
    // Pyodideが投げる例外はstderrへ自動出力されないため、今回のConsoleへ末尾を表示する。
    // 通常出力と同じbyte・行制限を通し、保存用の診断とは分けて扱う。
    const displayError = (message: string): void => {
      const lastLine = message.trimEnd().split('\n').at(-1);
      if (lastLine !== undefined && lastLine !== '') writeStderr?.(encode(`${lastLine}\n`));
    };
    let facts: Partial<
      Pick<
        PythonResult,
        | 'numericVariablePrinted'
        | 'sameVariableAdditionPrinted'
        | 'inputEchoed'
        | 'ageBoundaryBranched'
        | 'rangeIterated'
        | 'listReferenceSummed'
        | 'dictValuesSummed'
        | 'functionReturnScoped'
        | 'moduleImported'
        | 'exceptionHandled'
        | 'projectSummed'
        | 'expectedOutput'
      >
    > = {};
    const result = (status: PythonResult['status'], error?: string): PythonResult => ({
      type: 'python-result',
      status,
      stdout,
      stderr,
      rows,
      ...(version === undefined ? {} : { version }),
      ...(error === undefined ? {} : { error: error.slice(0, 4096) }),
      ...facts,
    });
    try {
      if (typeof input !== 'object' || input === null) throw new Error('Python input missing');
      const data = input as Record<string, unknown>;
      const profile = (data.profile ?? 'values-vars-print-v1') as PythonLessonProfile;
      const inputLines: unknown = data.inputLines ?? [];
      moduleProfile = isPythonModuleProfile(profile);
      const files = data.files ?? { 'main.py': data.source };
      if (
        !(data.wasm instanceof ArrayBuffer) ||
        !(data.stdlib instanceof ArrayBuffer) ||
        typeof data.source !== 'string' ||
        !validPythonFiles(files, profile) ||
        !Object.values(PYTHON_LESSONS).some((lesson) => lesson.profile === profile) ||
        !validPythonInputLines(inputLines)
      )
        throw new Error('Python input invalid');
      const wasm = await compile(data.wasm);
      root.fetch = (url: RequestInfo | URL): Promise<Response> => {
        const fixedURL: unknown =
          typeof url === 'string'
            ? url
            : url instanceof urlConstructor
              ? apply(urlHref, url, [])
              : undefined;
        if (fixedURL === 'https://python.invalid/python_stdlib.zip')
          return Promise.resolve(new response(data.stdlib as ArrayBuffer));
        if (fixedURL === 'https://python.invalid/pyodide.asm.wasm')
          return Promise.resolve(
            new response(new Uint8Array(), { headers: { 'Content-Type': 'application/wasm' } }),
          );
        return Promise.reject(new Error('固定Python core以外の取得は禁止'));
      };
      WebAssembly.instantiateStreaming = async (_response, imports) => ({
        instance: await instantiate(wasm, imports),
        module: wasm,
      });
      const py = await loadPyodide({
        indexURL: 'https://python.invalid/',
        lockFileContents: data.lock,
        packages: [],
        enableRunUntilComplete: false,
        jsglobals: Object.create(null) as object,
        createPyodideModule: createModule,
      });
      const observedVersion = py.runPython('import sys; sys.version');
      if (typeof observedVersion !== 'string') throw new Error('Python version unavailable');
      version = observedVersion.slice(0, 256);
      // stdout/stderrは別decoderにし、UTF-8の分割と改行なし出力をbytes段階で制限する。
      const makeWriter = (target: 'stdout' | 'stderr'): ((bytes: Uint8Array) => number) => {
        const decode = new decoder();
        let pendingRow: number | undefined;
        return (bytes) => {
          totalBytes += bytes.byteLength;
          if (outputState.limited || totalBytes > PYTHON_LIMITS.outputBytes) {
            outputState.limited = true;
            throw new Error('Python output limit');
          }
          const text = decode.decode(bytes, { stream: true });
          const pieces = text === '' ? [] : text.split('\n');
          if (text.endsWith('\n')) pieces.pop();
          const newRows = Math.max(0, pieces.length - (pendingRow === undefined ? 0 : 1));
          if (rows.length + newRows > PYTHON_LIMITS.lines) {
            outputState.limited = true;
            throw new Error('Python output limit');
          }
          const next = (target === 'stdout' ? stdout : stderr) + text;
          const lines = next.split('\n');
          if (
            lines.length > PYTHON_LIMITS.lines + 1 ||
            lines.some((line) => encode(line).byteLength > PYTHON_LIMITS.lineBytes)
          ) {
            outputState.limited = true;
            throw new Error('Python output limit');
          }
          if (target === 'stdout') stdout = next;
          else stderr = next;
          for (const [index, piece] of pieces.entries()) {
            if (pendingRow === undefined) {
              pendingRow = rows.length;
              rows.push({ level: target === 'stdout' ? 'log' : 'error', text: piece });
            } else rows[pendingRow]!.text += piece;
            if (index < pieces.length - 1 || text.endsWith('\n')) pendingRow = undefined;
          }
          return bytes.byteLength;
        };
      };
      py.setStdout({ write: makeWriter('stdout') });
      writeStderr = makeWriter('stderr');
      py.setStderr({ write: writeStderr });
      let inputIndex = 0;
      py.setStdin({ stdin: () => inputLines[inputIndex++] ?? null });
      restrictPythonWorker(root);
      prepared = true;
      send({ type: 'python-ready' });
      if (enforceLessonPolicy || moduleProfile) {
        const analysis = py.runPython(
          moduleProfile
            ? pythonModuleAnalysis(files, profile, inputLines)
            : pythonLessonAnalysis(data.source, profile),
          {
            globals: py.runPython('dict()'),
          },
        );
        if (typeof analysis !== 'string') throw new Error('Python analysis unavailable');
        const parsed = JSON.parse(analysis) as Record<string, unknown>;
        if (moduleProfile) {
          const packet = parsePythonModuleAnalysis(parsed);
          if (packet.state === 'syntax-error') {
            displayError(packet.syntaxMessage ?? 'Python syntax error');
            send({
              ...result('code-error', packet.syntaxMessage ?? 'Python syntax error'),
              file: packet.syntaxFile ?? 'main.py',
              reason: 'syntax',
            });
            return;
          }
        }
        if (parsed.supported !== true) {
          send(result('unsupported', 'このLessonの採点範囲外です。採点していません。'));
          return;
        }
        if (
          typeof parsed.numericVariablePrinted !== 'boolean' ||
          typeof parsed.sameVariableAdditionPrinted !== 'boolean'
        )
          throw new Error('Python source facts invalid');
        facts = {
          numericVariablePrinted: parsed.numericVariablePrinted,
          sameVariableAdditionPrinted: parsed.sameVariableAdditionPrinted,
          inputEchoed: parsed.inputEchoed === true,
          ageBoundaryBranched: parsed.ageBoundaryBranched === true,
          rangeIterated: parsed.rangeIterated === true,
          listReferenceSummed: parsed.listReferenceSummed === true,
          dictValuesSummed: parsed.dictValuesSummed === true,
          functionReturnScoped: parsed.functionReturnScoped === true,
          moduleImported: parsed.moduleImported === true,
          exceptionHandled: parsed.exceptionHandled === true,
          projectSummed: parsed.projectSummed === true,
          ...(moduleProfile
            ? { expectedOutput: parsePythonModuleAnalysis(parsed).expectedOutput }
            : {}),
        };
      }
      if (moduleProfile) {
        // 固定名だけを書き、次runの新Workerへfile/cacheを引き継がない。
        py.FS.mkdir('/workspace');
        py.FS.writeFile('/workspace/main.py', files['main.py']!);
        py.FS.writeFile('/workspace/lesson_tools.py', files['lesson_tools.py']!);
        learnerExecuting = true;
        py.runPython(
          'import sys; sys.path.insert(0, "/workspace"); source = open("/workspace/main.py", "rb").read(); exec(compile(source, "/workspace/main.py", "exec"), {"__name__": "__main__", "__file__": "/workspace/main.py"})',
          { globals: py.runPython('dict()') },
        );
      } else {
        learnerExecuting = true;
        py.runPython(data.source, { globals: py.runPython('dict()') });
      }
      // policy迂回診断はnativeの次taskも観測する。タイマー参照を学習者へ渡さない。
      if (!enforceLessonPolicy)
        await new Promise<void>((resolve) => {
          schedule(resolve, 100);
        });
      if (asynchronousFault) {
        send(result('system-error', 'Python diagnostic asynchronous fault'));
        return;
      }
      send(
        outputState.limited
          ? { ...result('stopped', 'Python output limit'), reason: 'output-limit' }
          : result('succeeded'),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Python runtime failed';
      const errorType: unknown =
        typeof error === 'object' && error !== null ? Reflect.get(error, 'type') : undefined;
      if (
        !outputState.limited &&
        prepared &&
        (!moduleProfile || learnerExecuting) &&
        typeof errorType === 'string' &&
        errorType !== 'EOFError'
      ) {
        try {
          displayError(message);
        } catch {
          // 詳細表示が出力上限に達した場合も、通常出力と同じ停止結果にする。
          outputState.limited = true;
        }
      }
      send({
        ...result(
          outputState.limited
            ? 'stopped'
            : errorType === 'EOFError'
              ? 'unsupported'
              : prepared && (!moduleProfile || learnerExecuting) && typeof errorType === 'string'
                ? 'code-error'
                : 'system-error',
          outputState.limited
            ? 'Python output limit'
            : errorType === 'EOFError'
              ? '実行前の入力行が不足しています。実行中の入力待ちには未対応です。入力を追加して再実行してください。採点していません。'
              : message,
        ),
        reason: outputState.limited
          ? 'output-limit'
          : errorType === 'SyntaxError'
            ? 'syntax'
            : 'runtime',
      });
    }
  }
}
