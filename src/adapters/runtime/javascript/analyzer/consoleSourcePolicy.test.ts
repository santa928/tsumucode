import { describe, expect, it } from 'vitest';
import { checkConsoleSource } from './consoleSourcePolicy';

describe('finite console source policy', () => {
  it('実行境界を作り直さず配列・オブジェクト添字と有限Promiseを許す', () => {
    expect(
      checkConsoleSource(
        'const a=[10,20]; const i=1; const o={alice:10}; const k="alice"; console.log(a[i],o[k]); new Promise(r=>r(10)).then(console.log);',
      ),
    ).toEqual({ status: 'supported' });
  });
  it.each([
    'MessageChannel',
    'Blob',
    'crypto',
    'FinalizationRegistry',
    'Atomics',
    'globalThis',
    'fetch',
    'setTimeout',
    'onrejectionhandled',
  ])('%s の非提供を実行前に診断する', (name) => {
    expect(checkConsoleSource(`${name};`)).toMatchObject({ status: 'unsupported', name });
  });
  it('局所bindingとproperty名をhost参照と混同しない', () => {
    expect(
      checkConsoleSource(
        'const MessageChannel={value:10}; const o={then:20,fetch:1}; const k="fetch"; console.log(MessageChannel.value,o[k],o.then); function f({crypto: {value}, Blob = 2}, ...fetch){ return [value,Blob,fetch]; }',
      ),
    ).toEqual({ status: 'supported' });
  });
  it('varの巻き上げ・関数名・catch bindingを解決する', () => {
    expect(
      checkConsoleSource(
        'function fetch(){ return 1; } function f(){ if(true){var Blob=1;} return Blob; } try{throw 1;}catch(crypto){console.log(crypto)} const fn=function MessageChannel(){return MessageChannel;};',
      ),
    ).toEqual({ status: 'supported' });
  });
  it.each([
    'function f(){const fetch=1;} fetch;',
    'for(let crypto of [1]){console.log(crypto);} crypto;',
    'try{}catch(Blob){} Blob;',
    'function f(value=fetch){var fetch=1;}',
    'const {value=fetch}={};',
    'const o = {[fetch]: 1};',
    'const { [fetch]: value } = {};',
  ])('bindingの外とdefault/computedの参照を取りこぼさない: %s', (source) => {
    expect(checkConsoleSource(source).status).toBe('unsupported');
  });
  it('未知の変数名は実行時ReferenceErrorへ渡す', () => {
    expect(checkConsoleSource('missingLessonValue;')).toEqual({ status: 'supported' });
  });
  it.each(['this', 'import("data:text/javascript,1")', 'class Counter {}'])(
    '有限profile外の構文を未対応とする: %s',
    (source) => {
      expect(checkConsoleSource(source).status).toBe('unsupported');
    },
  );
  it.each(['} console.log("escape"); {', 'return 1;', 'with({}){}', 'const = ;'])(
    '単一strict scriptとして成立しない入力を実行しない: %s',
    (source) => {
      expect(checkConsoleSource(source).status).toBe('syntax');
    },
  );
  it('行番号は学習者source基準で返す', () => {
    expect(checkConsoleSource('const x=1;\nfetch(x);')).toMatchObject({
      status: 'unsupported',
      line: 2,
      column: 1,
    });
  });
  it('解析器の深さ限界を学習者の構文ミスとしない', () => {
    expect(checkConsoleSource('('.repeat(5000) + '1' + ')'.repeat(5000)).status).toBe('system');
  });
  it('大きすぎる入力を学習者の構文ミスとしない', () => {
    expect(checkConsoleSource(' '.repeat(100 * 1024 + 1)).status).toBe('system');
  });
});
