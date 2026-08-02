import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { assertJavaScriptCapabilityPolicy } from './capabilityPolicy';

/** Capability Policy用にECMAScript sourceをlocation付きASTへ変換する。 */
function program(source: string) {
  return parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
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
