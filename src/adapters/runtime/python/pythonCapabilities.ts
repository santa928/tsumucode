/** 初期化後のWorkerの通信・保存・子Worker能力をglobalとprototypeから除去する。 */
export function restrictPythonWorker(root: object): void {
  // PyodideのPythonErrorは一時的にstackTraceLimitへ代入する。値を固定して例外生成だけを維持する。
  Object.defineProperty(Error, 'stackTraceLimit', {
    get: () => 20,
    set: () => undefined,
    configurable: false,
  });
  const allowed = new Set([
    'undefined',
    'NaN',
    'Infinity',
    'Object',
    'Function',
    'Array',
    'String',
    'Number',
    'Boolean',
    'BigInt',
    'Symbol',
    'Math',
    'JSON',
    'RegExp',
    'Date',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Promise',
    'Error',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError',
    'AggregateError',
    'Reflect',
    'Proxy',
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'ArrayBuffer',
    'DataView',
    'Uint8Array',
    'Int8Array',
    'Uint16Array',
    'Int16Array',
    'Uint32Array',
    'Int32Array',
    'Float32Array',
    'Float64Array',
    'Uint8ClampedArray',
    'BigInt64Array',
    'BigUint64Array',
    'WebAssembly',
    'TextEncoder',
    'TextDecoder',
  ]);
  // FunctionはPyodideのinstanceof用。文字列実行の拒否はCSPで維持する。
  for (
    let object: object | null = root;
    object !== null && object !== Object.prototype;
    object = Object.getPrototypeOf(object) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(object)) {
      if (allowed.has(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, name);
      if (
        descriptor !== undefined &&
        'value' in descriptor &&
        ((name === 'TEMPORARY' && descriptor.value === 0) ||
          (name === 'PERSISTENT' && descriptor.value === 1))
      )
        continue;
      Object.defineProperty(object, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
      if (Reflect.get(object, name) !== undefined) throw new Error('Python capability remains');
    }
  }
  // FFIからのprototype差替えで、信頼側decoderや結果生成のreceiverを渡さない。
  const visited = new Set<object>();
  const freezeIntrinsic = (value: unknown): void => {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return;
    if (visited.has(value)) return;
    visited.add(value);
    freezeIntrinsic(Object.getPrototypeOf(value));
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if ('value' in descriptor) freezeIntrinsic(descriptor.value);
      else {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- getter/setterを呼ばず参照の変更だけを固定する。
        freezeIntrinsic(descriptor.get);
        // eslint-disable-next-line @typescript-eslint/unbound-method -- getter/setterを呼ばず参照の変更だけを固定する。
        freezeIntrinsic(descriptor.set);
      }
    }
    Object.freeze(value);
  };
  for (const name of allowed) freezeIntrinsic(Reflect.get(root, name));
}
