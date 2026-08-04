export interface ConsoleLimits {
  readonly records: number;
  readonly recordBytes: number;
  readonly totalBytes: number;
  readonly depth: number;
  readonly collectionItems: number;
}

/** iframe内と親Protocolが共有するConsoleの固定上限。 */
export const CONSOLE_LIMITS: ConsoleLimits = Object.freeze({
  records: 100,
  recordBytes: 4 * 1024,
  totalBytes: 64 * 1024,
  depth: 3,
  collectionItems: 50,
});

export type ConsoleFormatter = (args: readonly unknown[]) => string;

/** trusted bootstrap時点のintrinsicだけを捕捉したConsole formatterを作る。 */
export function createConsoleFormatter(limits: ConsoleLimits = CONSOLE_LIMITS): ConsoleFormatter {
  const encoder = new TextEncoder();
  const encode = encoder.encode.bind(encoder);
  const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors.bind(Object);
  const getPrototypeOf = Object.getPrototypeOf.bind(Object);
  const objectPrototype = Object.prototype;
  const isArrayValue = Array.isArray.bind(Array);
  const apply = Reflect.apply.bind(Reflect);
  const ownKeys = Reflect.ownKeys.bind(Reflect);
  const stringify = JSON.stringify.bind(JSON);
  const toStringValue = String;
  const toNumber = Number;
  const toBoolean = Boolean;
  const isSafeInteger = Number.isSafeInteger.bind(Number);
  const fromCodePoint = String.fromCodePoint.bind(String);
  const WeakSetValue = WeakSet;
  const objectToString = getOwnPropertyDescriptors(objectPrototype).toString.value;
  const stringCodePointAt = getOwnPropertyDescriptors(String.prototype).codePointAt.value;
  const weakSetMethods = getOwnPropertyDescriptors(WeakSet.prototype);
  const weakSetHas = weakSetMethods.has.value;
  const weakSetAdd = weakSetMethods.add.value;
  const weakSetDelete = weakSetMethods.delete.value;
  if (
    typeof objectToString !== 'function' ||
    typeof stringCodePointAt !== 'function' ||
    typeof weakSetHas !== 'function' ||
    typeof weakSetAdd !== 'function' ||
    typeof weakSetDelete !== 'function'
  ) {
    throw new Error('Console formatter intrinsic could not be initialized');
  }
  const objectTag = (value: unknown): string => toStringValue(apply(objectToString, value, []));
  const codePointAt = (value: string, position: number): number | undefined => {
    const point: unknown = apply(stringCodePointAt, value, [position]);
    return typeof point === 'number' ? point : undefined;
  };
  const seenHas = (set: WeakSet<object>, value: object): boolean =>
    toBoolean(apply(weakSetHas, set, [value]));
  const seenAdd = (set: WeakSet<object>, value: object): void => {
    apply(weakSetAdd, set, [value]);
  };
  const seenDelete = (set: WeakSet<object>, value: object): void => {
    apply(weakSetDelete, set, [value]);
  };
  const ellipsis = '…';

  const byteLength = (value: string): number => encode(value).byteLength;
  const truncateUtf8 = (value: string, maximumBytes: number): string => {
    let bounded = '';
    let boundedBytes = 0;
    let truncated = false;
    let position = 0;
    while (position < value.length) {
      const point = codePointAt(value, position);
      if (point === undefined) break;
      const character = fromCodePoint(point);
      const characterBytes = byteLength(character);
      if (boundedBytes + characterBytes > maximumBytes) {
        truncated = true;
        break;
      }
      bounded += character;
      boundedBytes += characterBytes;
      position += character.length;
    }
    if (!truncated) return bounded;
    const ellipsisBytes = byteLength(ellipsis);
    if (maximumBytes < ellipsisBytes) return '';
    const contentBudget = maximumBytes - ellipsisBytes;
    let result = '';
    let usedBytes = 0;
    position = 0;
    while (position < bounded.length) {
      const point = codePointAt(bounded, position);
      if (point === undefined) break;
      const character = fromCodePoint(point);
      const characterBytes = byteLength(character);
      if (usedBytes + characterBytes > contentBudget) break;
      result += character;
      usedBytes += characterBytes;
      position += character.length;
    }
    return `${result}${ellipsis}`;
  };

  const propertyLabel = (key: PropertyKey): string => {
    if (typeof key === 'symbol') {
      try {
        return `[${toStringValue(key)}]`;
      } catch {
        return '[Unreadable]';
      }
    }
    return toStringValue(key);
  };

  const serialize = (
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
    maximumBytes: number,
    nested: boolean,
  ): string => {
    try {
      if (value === null) return 'null';
      if (typeof value === 'string') {
        const boundedValue = truncateUtf8(value, maximumBytes);
        const display = nested ? stringify(boundedValue) : boundedValue;
        return truncateUtf8(display, maximumBytes);
      }
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return truncateUtf8(toStringValue(value), maximumBytes);
      }
      if (typeof value === 'undefined') return 'undefined';
      if (typeof value === 'symbol') return truncateUtf8(toStringValue(value), maximumBytes);
      if (typeof value === 'function') {
        let name = '';
        try {
          name = typeof value.name === 'string' ? value.name : '';
        } catch {
          return '[Unreadable]';
        }
        return truncateUtf8(name.length === 0 ? '[Function]' : `[Function ${name}]`, maximumBytes);
      }
      if (typeof value !== 'object') return '[Unreadable]';
      if (seenHas(seen, value)) return '[Circular]';
      if (depth >= limits.depth) return ellipsis;

      seenAdd(seen, value);
      try {
        const isArray = isArrayValue(value);
        let prototype: object | null | undefined;
        if (!isArray) prototype = getPrototypeOf(value) as object | null;
        if (!isArray && prototype !== objectPrototype && prototype !== null) {
          return truncateUtf8(objectTag(value), maximumBytes);
        }

        const descriptors = getOwnPropertyDescriptors(value) as Readonly<
          Record<PropertyKey, PropertyDescriptor | undefined>
        >;
        const visibleKeys: PropertyKey[] = [];
        let truncatedCollection = false;
        if (isArray) {
          const lengthDescriptor = descriptors.length;
          const length =
            lengthDescriptor !== undefined &&
            'value' in lengthDescriptor &&
            isSafeInteger(lengthDescriptor.value) &&
            toNumber(lengthDescriptor.value) >= 0
              ? toNumber(lengthDescriptor.value)
              : 0;
          const visibleLength = length > limits.collectionItems ? limits.collectionItems : length;
          for (let index = 0; index < visibleLength; index += 1) {
            visibleKeys[visibleKeys.length] = toStringValue(index);
          }
          truncatedCollection = length > visibleLength;
        } else {
          const descriptorKeys = ownKeys(descriptors);
          for (let index = 0; index < descriptorKeys.length; index += 1) {
            const key = descriptorKeys[index];
            if (key === undefined || descriptors[key]?.enumerable !== true) continue;
            if (visibleKeys.length >= limits.collectionItems) {
              truncatedCollection = true;
              break;
            }
            visibleKeys[visibleKeys.length] = key;
          }
        }
        const open = isArray ? '[' : '{';
        const close = isArray ? ']' : '}';
        let output = open;

        for (let index = 0; index < visibleKeys.length; index += 1) {
          const key = visibleKeys[index];
          if (key === undefined) continue;
          const separator = output === open ? '' : ', ';
          const label = isArray ? '' : `${propertyLabel(key)}: `;
          const fixed = `${output}${separator}${label}${close}`;
          const remainingBytes = maximumBytes - byteLength(fixed);
          if (remainingBytes <= byteLength(ellipsis)) {
            truncatedCollection = true;
            break;
          }
          const descriptor = descriptors[key];
          const child =
            descriptor === undefined || !('value' in descriptor)
              ? '[Unreadable]'
              : serialize(descriptor.value, depth + 1, seen, remainingBytes, true);
          const candidate = `${output}${separator}${label}${child}`;
          if (byteLength(`${candidate}${close}`) > maximumBytes) {
            truncatedCollection = true;
            break;
          }
          output = candidate;
        }

        if (truncatedCollection) {
          const separator = output === open ? '' : ', ';
          output = truncateUtf8(`${output}${separator}${ellipsis}${close}`, maximumBytes);
          return output;
        }
        return truncateUtf8(`${output}${close}`, maximumBytes);
      } finally {
        seenDelete(seen, value);
      }
    } catch {
      return '[Unreadable]';
    }
  };

  return (args: readonly unknown[]): string => {
    const seen = new WeakSetValue<object>();
    let output = '';
    for (let index = 0; index < args.length; index += 1) {
      const separator = output.length === 0 ? '' : ' ';
      const remainingBytes = limits.recordBytes - byteLength(`${output}${separator}`);
      if (remainingBytes <= byteLength(ellipsis)) {
        output = truncateUtf8(`${output}${ellipsis}`, limits.recordBytes);
        break;
      }
      const rendered = serialize(args[index], 0, seen, remainingBytes, false);
      output = truncateUtf8(`${output}${separator}${rendered}`, limits.recordBytes);
      if (byteLength(output) >= limits.recordBytes) break;
    }
    return output;
  };
}

/** 学習コードの値をgetter実行なしのbounded plain textへ変換する。 */
export function formatConsoleArguments(
  args: readonly unknown[],
  limits: ConsoleLimits = CONSOLE_LIMITS,
): string {
  return createConsoleFormatter(limits)(args);
}
