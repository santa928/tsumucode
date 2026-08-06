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

  it('DOM EventはaddEventListenerだけを許可し、onclick等の未管理handlerを拒否する', () => {
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program("document.querySelector('#button').addEventListener('click', () => undefined);"),
        'script.js',
        'dom',
      );
    }).not.toThrow();
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program("document.querySelector('#button').onclick = () => undefined;"),
        'script.js',
        'dom',
      );
    }).toThrow(/Event handler/u);
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('const settings = { once: true }; console.log(settings.once);'),
        'script.js',
        'dom',
      );
    }).not.toThrow();
  });

  it.each(['core', 'modules', 'dom', 'async', 'project'] as const)(
    '%sでもObject reflectionによるruntime escapeを許可しない',
    (profile) => {
      const source = `function descriptorFor(value, name) {
  let prototype = value;
  while (prototype !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor !== undefined) return descriptor;
    prototype = Object.getPrototypeOf(prototype);
  }
}
const element = document.querySelector('#message');
const owner = descriptorFor(element, 'ownerDocument').get.call(element);
const view = descriptorFor(owner, 'defaultView').get.call(owner);
const script = owner.createElement('script');
const blob = view.Reflect.construct(view.Blob, [["console.log('reflection-injected')"]]);
descriptorFor(script, 'setAttribute').value.call(script, 'src', view.URL.createObjectURL(blob));
descriptorFor(owner.querySelector('head'), 'appendChild').value.call(
  owner.querySelector('head'),
  script,
);`;

      expect(() => {
        assertJavaScriptCapabilityPolicy(program(source), 'script.js', profile);
      }).toThrow(/Object|reflection|動的実行/u);
    },
  );

  it.each(['core', 'modules', 'dom', 'async', 'project'] as const)(
    '%sでもcomputed property連鎖によるruntime escapeを許可しない',
    (profile) => {
      const source = `const el = document.querySelector('#message');
const d = el['owner' + 'Document'];
const w = d['default' + 'View'];
const s = d['create' + 'Element']('script');
const blob = Reflect.construct(w['Blob'], [["console.log('blob-injected')"]]);
s['set' + 'Attribute']('s' + 'rc', w['URL']['create' + 'ObjectURL'](blob));
d['query' + 'Selector']('head')['append' + 'Child'](s);`;

      expect(() => {
        assertJavaScriptCapabilityPolicy(program(source), 'script.js', profile);
      }).toThrow(/computed property/u);
    },
  );

  it('配列の非負な数値Literal添字だけはcomputed accessとして許可する', () => {
    expect(() => {
      assertJavaScriptCapabilityPolicy(program('const first = [1, 2][0];'), 'script.js', 'core');
    }).not.toThrow();
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('const index = 0; const first = [1, 2][index];'),
        'script.js',
        'core',
      );
    }).toThrow(/computed property/u);
  });

  it.each(['core', 'modules', 'dom', 'async', 'project'] as const)(
    '%sでもBlob経由の未解析script生成を許可しない',
    (profile) => {
      expect(() => {
        assertJavaScriptCapabilityPolicy(
          program('const createUrl = URL.createObjectURL; const BlobType = Blob;'),
          'script.js',
          profile,
        );
      }).toThrow(/動的実行/u);
    },
  );

  it('DOM ProfileでもsetAttributeは静的な安全属性だけを許可する', () => {
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('document.querySelector("#app").setAttribute("aria-label", "結果");'),
        'script.js',
        'dom',
      );
    }).not.toThrow();
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('const name = "aria-label"; document.querySelector("#app").setAttribute(name, "結果");'),
        'script.js',
        'dom',
      );
    }).toThrow(/属性名/u);
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('document.querySelector("#app").setAttributeNS(null, "aria-label", "結果");'),
        'script.js',
        'dom',
      );
    }).toThrow(/setAttributeNS/u);
  });

  it('DOM Profileでもactive element生成とCSP nonce参照を拒否する', () => {
    for (const profile of ['dom', 'async', 'project'] as const) {
      expect(() => {
        assertJavaScriptCapabilityPolicy(
          program(`const nonce = document.querySelector('script').nonce;
const script = document.createElement('script');
script.nonce = nonce;
script.text = "document.body.dataset.injected='yes'";
document.querySelector('head').appendChild(script);`),
          'script.js',
          profile,
        );
      }).toThrow(/nonce|生成/u);
      expect(() => {
        assertJavaScriptCapabilityPolicy(
          program("const tag = 'script'; document.createElement(tag);"),
          'script.js',
          profile,
        );
      }).toThrow(/要素名/u);
      expect(() => {
        assertJavaScriptCapabilityPolicy(
          program("document.createElement('script');"),
          'script.js',
          profile,
        );
      }).toThrow(/生成/u);
    }
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program(
          "document.createElement('li').textContent = '項目'; document.createElement('input'); document.createElement('textarea'); document.createElement('select'); document.createElement('option'); document.createElement('form');",
        ),
        'script.js',
        'dom',
      );
    }).not.toThrow();
  });

  it('Promiseとbounded timerはasync Profileからだけ許可する', () => {
    for (const profile of ['core', 'modules', 'dom'] as const) {
      for (const source of [
        'Promise.resolve(1);',
        'setTimeout(() => {}, 0);',
        'setInterval(() => {}, 10);',
      ]) {
        expect(() => {
          assertJavaScriptCapabilityPolicy(program(source), 'script.js', profile);
        }).toThrow(/async/u);
      }
    }
    expect(() => {
      assertJavaScriptCapabilityPolicy(
        program('Promise.resolve(1); setTimeout(() => {}, 0);'),
        'script.js',
        'async',
      );
    }).not.toThrow();
  });

  it('member経由のlegacy windowとasync CapabilityでもProfile制限を迂回できない', () => {
    for (const profile of ['core', 'modules', 'dom'] as const) {
      for (const source of [
        "document.querySelector('body').getRootNode().parentWindow.setTimeout(() => {}, 0);",
        "document.querySelector('body').getRootNode().parentWindow.Promise.resolve(1);",
        "const facade = { setTimeout() {} }; facade.setTimeout();",
      ]) {
        expect(() => {
          assertJavaScriptCapabilityPolicy(program(source), 'script.js', profile);
        }).toThrow(/実行環境|async/u);
      }
    }
  });

  it.each(['core', 'modules', 'dom', 'async', 'project'] as const)(
    '%sでもbounded timer外の非同期入口を拒否する',
    (profile) => {
      for (const source of [
        "queueMicrotask(() => console.log('late'));",
        'requestAnimationFrame(() => undefined);',
        'requestIdleCallback(() => undefined);',
        'scheduler.postTask(() => undefined);',
        'new MessageChannel();',
        'new MutationObserver(() => undefined);',
        "addEventListener('message', () => undefined);",
        "postMessage('message', '*');",
      ]) {
        expect(() => {
          assertJavaScriptCapabilityPolicy(program(source), 'script.js', profile);
        }).toThrow(/非同期|Event/u);
      }
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
