import { createHash } from 'node:crypto';
/** Narrow canonical contract for actual native file records; no submitted callback is executed. */
export function nativeFixtureSourceDigest(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files))
    throw new Error('Invalid native files');
  const compare = (left, right) => {
    const a = Array.from(left, (character) => character.codePointAt(0));
    const b = Array.from(right, (character) => character.codePointAt(0));
    for (let index = 0; index < Math.min(a.length, b.length); index += 1)
      if (a[index] !== b[index]) return a[index] - b[index];
    return a.length - b.length;
  };
  const fields = Object.keys(files)
    .sort(compare)
    .map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(files, key);
      if (
        !descriptor ||
        !Object.hasOwn(descriptor, 'value') ||
        typeof descriptor.value !== 'string'
      )
        throw new Error('Invalid native source');
      return JSON.stringify(key) + ':' + JSON.stringify(descriptor.value);
    })
    .join(',');
  return createHash('sha256')
    .update('{"faultInjection":null,"files":{' + fields + '},"inputLines":null}')
    .digest('hex');
}
