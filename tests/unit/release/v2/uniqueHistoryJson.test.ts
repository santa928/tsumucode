// @vitest-environment node
import { expect, it } from 'vitest';
import { parseUniqueHistoryJson } from '../../../../scripts/release/v2/uniqueHistoryJson';

it('preserves native parsing of pretty, compact and distinct nested keys',()=>{
  for(const text of ['{\n "a":{"x":1}, "b":[{"x":2},{"x":3}]\n}',
    String.raw`{"str":"a,}\"[","num":-0,"nil":null}`,'[1,{"k":true}]'])
    expect(parseUniqueHistoryJson(text)).toEqual(JSON.parse(text));
});
it('rejects decoded duplicates including escape equivalence and nested objects',()=>{
  for(const text of [String.raw`{"a":1,"\u0061":2}`,String.raw`{"x":{"a":1,"\u0061":2}}`,
    String.raw`{"\ud83d\ude00":1,"😀":2}`,String.raw`{"__proto__":1,"\u005f_proto__":2}`,
    String.raw`{"":1,"":2}`,String.raw`{"a\"b":1,"a\u0022b":2}`])
    expect(()=>parseUniqueHistoryJson(text)).toThrow('Invalid or duplicate JSON');
});
it('keeps native syntax validation and does not expose input in errors',()=>{
  for(const text of ['{"secret":"synthetic-secret-marker', '{"x":1,}', '{"x":01}', '{} {}', '\ufeff{}'])
    expect(()=>parseUniqueHistoryJson(text)).toThrow('Invalid or duplicate JSON');
});
it('uses an iterative scan on deeply nested objects and arrays',()=>{
  const n=20000, text='{"a":'.repeat(n)+'0'+'}'.repeat(n);
  expect(()=>parseUniqueHistoryJson(text)).not.toThrow();
  expect(()=>parseUniqueHistoryJson('['.repeat(n)+'0'+']'.repeat(n))).not.toThrow();
});
it('accepts a 16 MiB document without changing the caller byte limit',()=>{
  const size=16*1024*1024, text='{"x":"'+'a'.repeat(size-8)+'"}';
  expect(Buffer.byteLength(text)).toBe(size);
  expect((parseUniqueHistoryJson(text) as {x:string}).x.length).toBe(size-8);
});
