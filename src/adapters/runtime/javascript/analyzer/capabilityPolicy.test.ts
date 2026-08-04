import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { assertJavaScriptCapabilityPolicy } from './capabilityPolicy';

/** Capability Policy用にECMAScript sourceをlocation付きASTへ変換する。 */
function program(source: string, sourceType: 'script' | 'module' = 'script') {
  return parse(source, {
    ecmaVersion: 'latest',
    sourceType,
    locations: true,
  });
}

describe('assertJavaScriptCapabilityPolicy', () => {
  it('Chapter 00で使うquerySelectorとtextContent代入を許可する', () => {
    const source = 'document.querySelector("#message").textContent = "こんにちは";';

    expect(() => {
      assertJavaScriptCapabilityPolicy(program(source), 'script.js');
    }).not.toThrow();
  });

  it('coreは基礎構文とChapter 00互換DOMだけを許可する', () => {
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('const values = [1, 2].map((value) => value * 2);'),
        'script.js',
        'core',
      );
    }).not.toThrow();
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('document.querySelector("#app").textContent = "ready";'),
        'script.js',
        'core',
      );
    }).not.toThrow();
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('document.createElement("button");'),
        'script.js',
        'core',
      );
    }).toThrow(/許可/u);
  });

  it('ProfileごとにDOM・async・moduleを段階的に許可する', () => {
    const createElement = program('document.createElement("button");');
    expect(() => {
      assertJavaScriptCapabilityPolicy(createElement, 'script.js', 'dom');
    }).not.toThrow();

    const asyncFunction = program('async function load() { await Promise.resolve(1); }');
    expect(() => {
      assertJavaScriptCapabilityPolicy(asyncFunction, 'script.js', 'core');
    }).toThrow(/async/u);
    expect(() => {
      assertJavaScriptCapabilityPolicy(asyncFunction, 'script.js', 'async');
    }).not.toThrow();

    const moduleProgram = program('export const value = 1;', 'module');
    expect(() => {
      assertJavaScriptCapabilityPolicy(moduleProgram, 'script.js', 'core');
    }).toThrow(/module/u);
    expect(() => {
      assertJavaScriptCapabilityPolicy(moduleProgram, 'script.js', 'modules');
    }).not.toThrow();
  });

  it.each(['core', 'modules', 'dom', 'async', 'project'] as const)(
    '%sでも外部通信を許可しない',
    (profile) => {
      expect(() => {
        assertJavaScriptCapabilityPolicy(program('fetch("/collect");'), 'script.js', profile);
      }).toThrow(/外部通信/u);
    },
  );

  it.each([
    ['eval("1")', /許可されていない/u],
    ['Function("return 1")()', /許可されていない/u],
    ['import("./module.js")', /動的import/u],
    ['fetch("https://example.com")', /外部通信/u],
    ['new XMLHttpRequest()', /外部通信/u],
    ['navigator.sendBeacon("/collect")', /外部通信/u],
    ['new Worker("worker.js")', /Worker/u],
    ['navigator.serviceWorker.register("sw.js")', /Worker/u],
    ['localStorage.setItem("key", "value")', /Storage/u],
    ['document.cookie', /許可されていない/u],
    ['window.location = "https://example.com"', /画面遷移/u],
    ['self.parent.postMessage("message", "*")', /画面遷移/u],
    ['frames[0]', /画面遷移/u],
    ['history.pushState({}, "", "/next")', /画面遷移/u],
    ['open("https://example.com")', /popup/u],
    ['document["cookie"]', /computed property/u],
    ['navigator["language"]', /computed property/u],
    ['document.unknownMember', /許可されていない/u],
    ['const capability = fetch; capability("/collect")', /外部通信/u],
    ['setTimeout("alert(1)", 0)', /文字列timer/u],
    ['new Image()', /外部resource/u],
    ['document.querySelector("#image")["src"] = "https://example.com/a.png"', /URL member/u],
    [
      'document.querySelector("#image").setAttribute("src", "https://example.com/a.png")',
      /外部resource/u,
    ],
    [
      'const name = "src"; document.querySelector("#image").setAttribute(name, "https://example.com/a.png")',
      /属性変更/u,
    ],
    [
      'document.querySelector("body").innerHTML = "<img src=https://example.com/a.png>"',
      /HTML挿入/u,
    ],
    [
      'document.querySelector("body").ownerDocument.defaultView.fetch("https://example.com")',
      /実行環境/u,
    ],
    ['document.querySelector("body").constructor.constructor("return 1")()', /動的実行/u],
    ['class Unsupported {}', /この構文/u],
    ['/(a+)+$/.test("aaaaaaaaaaaaaaaa!")', /正規表現/u],
  ])('%s を拒否する', (source, message) => {
    expect(() => {
      assertJavaScriptCapabilityPolicy(program(source), 'script.js');
    }).toThrow(message);
  });
});
