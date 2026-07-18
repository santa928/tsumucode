/** JSONで一意に表せる値だけを受け入れ、安定したhash入力を生成する。 */

/** Unicode code point列を辞書順比較する。 */
function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

/** objectがJSON dataとして扱えるplain objectかを判定する。 */
function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/** 値を検証しながらcanonical JSON断片へ再帰変換する。 */
function serializeCanonical(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonical JSONでは有限numberだけを使用できます');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new Error(`canonical JSONで表せない値です: ${typeof value}`);
  }
  if (ancestors.has(value)) throw new Error('canonical JSONで循環参照は使用できません');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new Error('canonical JSONで疎なarrayは使用できません');
        }
      }
      const enumerableKeys = Object.keys(value);
      if (
        enumerableKeys.length !== value.length ||
        enumerableKeys.some((key, index) => key !== String(index))
      ) {
        throw new Error('canonical JSONのarrayに追加propertyは使用できません');
      }
      return `[${value.map((item) => serializeCanonical(item, ancestors)).join(',')}]`;
    }

    if (!isPlainObject(value)) {
      throw new Error('canonical JSONではplain objectだけを使用できます');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error('canonical JSONでsymbol keyは使用できません');
    }
    const entries = Object.keys(value)
      .sort(compareCodePoints)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serializeCanonical(Object.getOwnPropertyDescriptor(value, key)?.value, ancestors)}`,
      );
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** JSON object keyをcode point順で再帰sortし、入力を変更せずcanonical textを返す。 */
export function canonicalJson(value: unknown): string {
  return serializeCanonical(value, new WeakSet<object>());
}

/** Web Cryptoで偶発破損検出用SHA-256 hex digestを返す。 */
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
