# JavaScript Runner／Validator Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user selected inline execution; do not dispatch subagents.

**Goal:** JavaScript Chapter 00を非掲載の正式教材として追加し、安全な3ファイル編集・実行・判定基盤を完成させる。

**Architecture:** 既存の`RunnerAdapter`、`ValidatorAdapter`、`EditorLanguageRegistry`を拡張し、JavaScript固有実装はJavaScript演習routeでだけ遅延読込する。Analyzer WorkerがAST検査とbudget guard挿入を担い、opaque-origin iframeは監視済みSourceだけを実行し、Controllerが同一revisionのevidenceとDOM SnapshotをValidatorへ渡す。

**Tech Stack:** React 19、TypeScript 6、CodeMirror 6、Acorn 8、acorn-walk 8、MagicString 1、Web Worker、sandboxed iframe、Zod、Vitest、Playwright、GitHub Pages

## Global Constraints

- `main`上で実装し、各release unitを日本語commit、secret scan、push、GitHub Pages beta公開まで完了する。
- npm、build、test、dev serverはすべて`./scripts/docker-compose.sh`経由でDocker内実行する。
- `acorn@8.18.0`、`acorn-walk@8.3.5`、`magic-string@1.1.0`、`@codemirror/lang-javascript@6.2.5`を完全一致で直接依存へ追加する。
- JavaScript Course完成までは`draft`とし、Home、公開LearningPath、Slide Libraryには掲載しない。品質確認用の直接URLだけを提供する。
- HTML/CSSのURL、進捗、下書き、Reset、Review、Slide Library、chunk境界を維持する。
- Source上限は1 File 100 KiB、Workspace合計300 KiB。Analyzer deadlineは500 ms、実行は100,000 checkpointまたは250 ms、bridge readyは1,500 ms、timerは同時10件までとする。
- Home初期JavaScript gzipは256,000 bytes以下、JavaScript固有lazy graphは180,000 bytes以下、Preview p95は500 ms以下、判定p95は1,000 ms以下とする。
- 1280x720は通常Scrollなし、390x844はStage内部の救済Scrollだけを許容する。
- `docs/quality/javascript-vertical-slice-design.md`のREQ-JS-001〜018、受け入れ条件、非対象、リスク対策を変更しない。

---

## File Structure

- `src/core/runtime/contracts.ts`: boundedな`RunnerEvidence`とrender／snapshot identity契約。
- `src/core/validation/contracts.ts`: Validatorへ渡すevidence契約。
- `src/features/learning/session/LearningSessionController.ts`: viewport間evidence整合と判定入力の調停。
- `src/adapters/runtime/javascript/analyzer/*`: AST検査、Capability Policy、budget guard、Worker protocol。
- `src/adapters/runtime/javascript/runner/*`: iframe protocol、CSP付きsrcdoc、watchdog、snapshot取得。
- `src/adapters/validation/javascript/*`: JavaScript rule schema、source fact／evidence／DOMのAND評価。
- `src/features/learning/javascriptRuntimeServices.ts`: JavaScript固有Runner／Validator／Editorの遅延登録。
- `content/javascript/*`: draft Course Chapter 00のConcept、Glossary、Slide、Exercise、Fixture。
- `scripts/content/*`: 複数CourseとJavaScript strict ruleのauthoring検証。
- `e2e/javascript-*.spec.ts`: edit、security、error recovery、Accessibility、subpathの実ブラウザ検証。

### Task 1: Evidence契約とController集約

**Files:**

- Modify: `src/core/runtime/contracts.ts`
- Modify: `src/core/validation/contracts.ts`
- Modify: `src/features/learning/session/LearningSessionController.ts`
- Test: `src/features/learning/session/LearningSessionController.test.ts`
- Test: `tests/unit/runtime/runnerRegistry.test.ts`

**Interfaces:**

- Consumes: 既存`RunnerRenderResult`、`ValidationContext`、`PreviewViewport`。
- Produces: `RunnerEvidence`、`RunnerRenderResult.evidence`、`ValidationContext.evidence`。

- [x] **Step 1: 失敗テストを書く**

```ts
it('全viewportで一致したbounded evidenceだけをValidatorへ渡す', async () => {
  render.mockResolvedValue({
    exerciseSessionId: 'course:exercise',
    executionRevision: 1,
    diagnostics: [],
    evidence: [
      { id: 'javascript.executed', value: true },
      { id: 'javascript.source-sha256', file: 'script.js', value: 'a'.repeat(64) },
    ],
  });
  await controller.validateNow();
  expect(validate).toHaveBeenCalledWith(
    expect.objectContaining({
      evidence: expect.arrayContaining([{ id: 'javascript.executed', value: true }]),
    }),
  );
});

it('viewport間でevidenceが異なる場合はsystem errorとして拒否する', async () => {
  render
    .mockResolvedValueOnce(resultWithEvidence(true))
    .mockResolvedValueOnce(resultWithEvidence(false));
  await expect(controller.validateNow()).rejects.toThrow('Runner evidence');
});
```

- [x] **Step 2: 対象テストを実行しREDを確認する**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/features/learning/session/LearningSessionController.test.ts tests/unit/runtime/runnerRegistry.test.ts`

Expected: `evidence`未定義または型不一致でFAILする。

- [x] **Step 3: bounded scalar契約を実装する**

```ts
export type RunnerEvidenceValue = string | number | boolean;

export interface RunnerEvidence {
  readonly id: string;
  readonly file?: string;
  readonly value: RunnerEvidenceValue;
}

export interface RunnerRenderResult {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly evidence: readonly RunnerEvidence[];
}
```

Controllerでは`id` 1〜128文字、`file` 1〜256文字、文字列値4,096文字以下、配列64件以下を検査し、`JSON.stringify([id,file,value])`の整列済み配列が全viewportで一致した場合だけValidatorへ渡す。HTML/CSS Runnerは必ず`evidence: []`を返す。

- [x] **Step 4: 対象テストとHTML/CSS回帰をGREENにする**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/features/learning/session/LearningSessionController.test.ts src/adapters/runtime/html-css src/core/runtime`

Expected: 全テストPASS。

- [x] **Step 5: formatと型を確認する**

Run: `./scripts/docker-compose.sh run --rm app npm run format:check`

Run: `./scripts/docker-compose.sh run --rm app npm run typecheck`

Expected: どちらもexit 0。

### Task 2: Analyzer WorkerとCapability Policy

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/adapters/runtime/javascript/analyzer/contracts.ts`
- Create: `src/adapters/runtime/javascript/analyzer/capabilityPolicy.ts`
- Create: `src/adapters/runtime/javascript/analyzer/instrumentJavaScript.ts`
- Create: `src/adapters/runtime/javascript/analyzer/analyzerWorker.ts`
- Create: `src/adapters/runtime/javascript/analyzer/JavaScriptAnalyzerClient.ts`
- Test: `src/adapters/runtime/javascript/analyzer/capabilityPolicy.test.ts`
- Test: `src/adapters/runtime/javascript/analyzer/instrumentJavaScript.test.ts`
- Test: `src/adapters/runtime/javascript/analyzer/JavaScriptAnalyzerClient.test.ts`

**Interfaces:**

- Consumes: UTF-8の`script.js` sourceと`executionRevision`。
- Produces: `analyzeJavaScript(request): Promise<JavaScriptAnalysisResult>`。成功時は監視済みcode、SHA-256、source facts、失敗時は初心者向けdiagnosticを返す。

- [x] **Step 1: 完全一致dependencyをDocker内で追加する**

Run: `./scripts/docker-compose.sh run --rm app npm install --save-exact acorn@8.18.0 acorn-walk@8.3.5 magic-string@1.1.0 @codemirror/lang-javascript@6.2.5`

Expected: `package.json`とlockfileへ指定versionが直接記録される。

- [x] **Step 2: syntax、security、budget挿入の失敗テストを書く**

```ts
expect(analyze('while (true) {}').instrumentedCode).toContain('__tsumuBudget.checkLoop()');
expect(analyze('function recurse(){ recurse() }').instrumentedCode).toContain(
  '__tsumuBudget.enterFunction()',
);
expect(() => analyze('fetch("https://example.com")')).toThrowError(/外部通信/);
expect(() => analyze('document["cookie"]')).toThrowError(/computed property/);
expect(() => analyze('eval("1")')).toThrowError(/許可されていない/);
expect(() => analyze('const broken =')).toThrowError(/構文/);
```

- [x] **Step 3: REDを確認する**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/adapters/runtime/javascript/analyzer`

Expected: module未作成でFAIL。

- [x] **Step 4: AST制限とfail-closed policyを実装する**

`parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true })`で解析し、100 KiB、20,000 node、深度256、文字列64 KiB、配列10,000要素を超える入力を拒否する。`eval`、`Function`、dynamic import、WebAssembly、Network、Worker、Storage、navigation、未知の`document`／`navigator` member、computed capability accessを`security` diagnosticへ変換する。

- [x] **Step 5: Loop／Function entryへguardを挿入する**

```ts
export interface InstrumentedJavaScript {
  readonly code: string;
  readonly sourceSha256: string;
  readonly facts: readonly JavaScriptSourceFact[];
}
```

`while`、`do-while`、`for`、`for-in`、`for-of`のbody先頭と通常Function／arrow Functionのentryへguard呼出しを挿入する。単文bodyはblockへ変換し、directive prologueより後へFunction guardを置く。

- [x] **Step 6: Worker deadlineとstale応答破棄を実装する**

Clientはrequest IDごとにpendingを保持し、500 msで`Worker.terminate()`して`system` diagnosticを返す。dispose後、別revision、重複response、未知request IDを受理しない。

- [x] **Step 7: 対象テスト、audit、licenseをGREENにする**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/adapters/runtime/javascript/analyzer`

Run: `./scripts/docker-compose.sh run --rm app npm audit --omit=dev`

Run: `./scripts/docker-compose.sh run --rm app npm audit`

Expected: Analyzer全テストPASS、audit 0 vulnerabilities。lockfile上で4依存のlicenseがMITであることを確認する。

### Task 3: opaque-origin JavaScript Runner

**Files:**

- Create: `src/adapters/runtime/javascript/runner/protocol.ts`
- Create: `src/adapters/runtime/javascript/runner/createJavaScriptSrcdoc.ts`
- Create: `src/adapters/runtime/javascript/runner/bridgeSource.ts`
- Create: `src/adapters/runtime/javascript/runner/JavaScriptRunnerAdapter.ts`
- Create: `src/adapters/runtime/javascript/index.ts`
- Test: `src/adapters/runtime/javascript/runner/createJavaScriptSrcdoc.test.ts`
- Test: `src/adapters/runtime/javascript/runner/JavaScriptRunnerAdapter.test.ts`

**Interfaces:**

- Consumes: Task 2の`JavaScriptAnalyzerClient`、既存preview-kernel sanitizer、Task 1のevidence契約。
- Produces: `JavaScriptRunnerAdapter implements RunnerAdapter`、`languageId = 'javascript'`。

- [x] **Step 1: CSP、identity、watchdogの失敗テストを書く**

```ts
expect(srcdoc).toContain("default-src 'none'");
expect(srcdoc).toContain("connect-src 'none'");
expect(srcdoc).toContain("form-action 'none'");
expect(srcdoc).not.toContain('allow-same-origin');
await expect(adapter.render(inputWith('while(true){}'))).resolves.toMatchObject({
  diagnostics: [expect.objectContaining({ kind: 'system' })],
});
expect(postMessageFromWrongWindow()).toBeIgnored();
```

- [x] **Step 2: REDを確認する**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/adapters/runtime/javascript/runner`

Expected: Runner module未作成でFAIL。

- [x] **Step 3: trusted bootstrapとbudget objectを実装する**

```ts
interface ExecutionBudget {
  checkLoop(): boolean;
  enterFunction(): boolean;
  leaveFunction(): void;
}
```

100,000 checkpointまたは250 msでguardが`false`を返し、挿入code側はLoopを`break`、Functionを`return`する。timerは最大10件、callbackごとにbudgetを再開し、validation／dispose時に全timerを破棄する。`try/catch`へ例外を投げない。

- [x] **Step 4: sandbox、CSP、API無効化、protocolを実装する**

frameは`sandbox="allow-scripts"`、`referrerpolicy="no-referrer"`とし、nonce付きtrusted scriptだけを許可する。`fetch`、XHR、WebSocket、EventSource、Beacon、Worker、Storage、open、navigation sink、form送信を実行前に無効化する。token、session ID、revision、`event.source === frame.contentWindow`が一致する応答だけを受理する。

- [x] **Step 5: 正常renderとevidenceを実装する**

```ts
evidence: [
  { id: 'javascript.executed', value: true },
  { id: 'javascript.source-sha256', file: 'script.js', value: analysis.sourceSha256 },
  { id: 'javascript.budget-exhausted', value: false },
];
```

HTMLから`script`とevent handlerを除去し、CSSと同一Origin教材Assetだけを既存preview kernelでmaterializeする。bridge readyが1,500 ms以内に届かない場合はframeを再生成し、直前の正常Preview DOMを保持する。

- [x] **Step 6: Snapshotを既存契約へ接続する**

Task 1と同じsession／revisionだけを観測し、`requestId`重複、別session、別revisionを拒否する。snapshot payloadは既存HTML/CSS bridgeのbounded node変換を共通化して再利用する。

- [x] **Step 7: Runner単体テストをGREENにする**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/adapters/runtime/javascript src/adapters/runtime/html-css`

Expected: JavaScriptとHTML/CSS Runner全テストPASS。

### Task 4: JavaScript strict rule schemaとValidator

**Files:**

- Modify: `src/core/content/schema.ts`
- Modify: `src/core/content/types.ts`
- Create: `src/adapters/validation/javascript/ruleSchema.ts`
- Create: `src/adapters/validation/javascript/JavaScriptValidator.ts`
- Create: `src/adapters/validation/javascript/index.ts`
- Test: `src/adapters/validation/javascript/ruleSchema.test.ts`
- Test: `src/adapters/validation/javascript/JavaScriptValidator.test.ts`
- Modify: `src/core/content/schema.test.ts`

**Interfaces:**

- Consumes: Task 1の`ValidationContext.evidence`、Task 2のsource fact表現、既存`ValidatorRuleEngine`。
- Produces: `JavaScriptValidationRuleDefinition`と`JavaScriptValidator implements ValidatorAdapter`。

- [ ] **Step 1: strict schemaの失敗テストを書く**

```ts
expect(() => parseJavaScriptRule(ruleWith({ unknown: true }))).toThrow();
expect(() => parseJavaScriptRule(ruleWith({ solutionFiles: [] }))).toThrow();
expect(parseJavaScriptRule(validSourceRule).target.kind).toBe('javascript-source');
```

- [ ] **Step 2: source／evidence／DOMのAND判定テストを書く**

```ts
expect(await validate(correctSource, matchingEvidence, matchingSnapshot)).toMatchObject({
  status: 'pass',
});
expect(await validate(htmlOnlySpoof, matchingEvidence, matchingSnapshot)).toMatchObject({
  status: 'incomplete',
});
expect(await validate(correctSource, staleEvidence, matchingSnapshot)).toMatchObject({
  status: 'system-error',
});
```

- [ ] **Step 3: REDを確認する**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/adapters/validation/javascript src/core/content/schema.test.ts`

Expected: JavaScript rule未定義でFAIL。

- [ ] **Step 4: rule schemaを実装する**

Chapter 00のsource ruleは`document.querySelector('#message')`で得たtargetの`textContent`へ期待文字列を代入するAST factを要求する。DOM ruleは既存selector text assertionを内包し、unknown fieldとauthoring-only fieldを拒否する。

- [ ] **Step 5: Validatorを実装する**

診断に`syntax`／`reference`／`security` errorがあれば`code-error`、Analyzer／bridge／hash identity障害なら`system-error`にする。現在Source SHA、`javascript.executed=true`、`budget-exhausted=false`、全viewport DOMの4条件をAND評価する。

- [ ] **Step 6: 対象テストと既存Validator回帰をGREENにする**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/adapters/validation src/core/validation src/core/content/schema.test.ts`

Expected: 全テストPASS。

### Task 5: JavaScript固有サービスの遅延登録とEditor

**Files:**

- Create: `src/features/learning/editor/javascriptEditorLanguage.ts`
- Test: `src/features/learning/editor/javascriptEditorLanguage.test.ts`
- Create: `src/features/learning/javascriptRuntimeServices.ts`
- Test: `src/features/learning/javascriptRuntimeServices.test.ts`
- Modify: `src/features/learning/pages/EditableExercisePage.tsx`
- Modify: `src/features/learning/pages/LearningRoutes.test.tsx`
- Modify: `src/features/learning/runtimeServices.ts`
- Modify: `src/features/learning/runtimeServices.test.ts`

**Interfaces:**

- Consumes: Task 3のRunner、Task 4のValidator、`@codemirror/lang-javascript`。
- Produces: `ensureCourseRuntime(course, services): Promise<void>`と`registerJavaScriptEditorLanguage(registry): Promise<void>`。

- [ ] **Step 1: 初期graph非混入とJavaScript route遅延読込の失敗テストを書く**

```ts
expect(homeManifestModules).not.toContain('acorn');
expect(homeManifestModules).not.toContain('@codemirror/lang-javascript');
await ensureCourseRuntime(javascriptCourse, services);
expect(services.runnerRegistry.create('javascript').languageId).toBe('javascript');
expect(services.validatorRegistry.has('javascript')).toBe(true);
```

- [ ] **Step 2: REDを確認する**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/features/learning/javascriptRuntimeServices.test.ts src/features/learning/pages/LearningRoutes.test.tsx`

Expected: JavaScript登録module未作成でFAIL。

- [ ] **Step 3: JavaScript editor profileを実装する**

`javascript({ jsx: false, typescript: false })`、2 space indent、bracket matching、close bracketsを登録する。既存registryを上書きせず、import失敗時はpending Promiseを破棄して再試行可能にする。

- [ ] **Step 4: Course IDによる遅延runtime登録を実装する**

`html-css`は既存同期経路を維持し、`javascript`だけが`import('../../adapters/runtime/javascript')`、`import('../../adapters/validation/javascript')`、JavaScript editor languageをExercise routeで読み込む。unknown IDは明示的な準備Errorにする。

- [ ] **Step 5: UI文言とError focusを接続する**

`script.js`初期選択、File／line付きError summary、再試行CTA、live regionを追加する。構文・securityは「コードを直す」、system errorは「もう一度実行する」とし、Source／cursor／selected fileを変更しない。

- [ ] **Step 6: route、Editor、runtimeテストをGREENにする**

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- src/features/learning/editor src/features/learning/javascriptRuntimeServices.test.ts src/features/learning/pages/LearningRoutes.test.tsx src/features/learning/runtimeServices.test.ts`

Expected: 全テストPASS。

### Task 6: draft JavaScript Chapter 00教材とCompiler

**Files:**

- Create: `content/javascript/course.yaml`
- Create: `content/javascript/concepts.yaml`
- Create: `content/javascript/glossary.yaml`
- Create: `content/javascript/provenance.yaml`
- Create: `content/javascript/performance.yaml`
- Create: `content/javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01/lesson.yaml`
- Create: `content/javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01/slides/s01-three-roles.md`
- Create: `content/javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01/slides/s02-script-connection.md`
- Create: `content/javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01/slides/s03-read-text-content.md`
- Create: `content/javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01/slides/s04-change-checkpoint.md`
- Create: `content/javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01/exercises/javascript-ch00-l01-e01/exercise.yaml`
- Create: `content/javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01/exercises/javascript-ch00-l01-e01/instructions.md`
- Create: starter、solution、pass、incomplete、html-only、syntax-error、security、timeout Fixtureの`index.html`、`styles.css`、`script.js`
- Modify: `scripts/content/compile.ts`
- Modify: `scripts/content/compileCourse.ts`
- Modify: `scripts/content/sourceSchema.ts`
- Modify: `scripts/content/verifyContentReview.ts`
- Test: `scripts/content/compile.test.ts`
- Test: `scripts/content/sourceSchema.test.ts`
- Test: `scripts/content/splitContentDelivery.test.ts`

**Interfaces:**

- Consumes: Task 4のJavaScript rule schema、現行Catalog v3／Course Index／Lesson manifest compiler。
- Produces: `generated/content/courses/javascript/index.json`とLesson manifest。Catalog entryは`publication: draft`として直接URLからだけ解決できる。

- [ ] **Step 1: draft掲載境界とFixtureの失敗テストを書く**

```ts
expect(catalog.courses.find(({ id }) => id === 'javascript')?.publication).toBe('draft');
expect(homeVisibleCourses).not.toContain('javascript');
expect(publicLearningPathCourseIds).not.toContain('javascript');
expect(await compileFixture('pass')).toMatchObject({ expectedStatus: 'pass' });
expect(await compileFixture('html-only')).toMatchObject({ expectedStatus: 'incomplete' });
```

- [ ] **Step 2: REDを確認する**

Run: `./scripts/docker-compose.sh run --rm app npm run content:check`

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content`

Expected: JavaScript authoring schemaまたは教材未定義でFAIL。

- [ ] **Step 3: Course metadataと4 Slideを独自制作する**

Slide 1は3役、Slide 2は`script.js`読込、Slide 3は`querySelector`／`textContent`の「探す・変える・結果」、Slide 4は引用符内だけを変える予告に限定する。各Slideはscreen budget内、直前Slideにない記述をExerciseで要求しない。

- [ ] **Step 4: 3 File Exerciseと3段階Hintを制作する**

Starterの`script.js`は次の1行を含む。

```js
document.querySelector('#message').textContent = 'ここを書き換えます';
```

Solutionは文字列だけを`JavaScriptで文字を変えました`へ変更する。Hintは(1)`script.js`を開く、(2)引用符内を探す、(3)完成文字列を示す順とする。

- [ ] **Step 5: Fixtureとcontent reviewを実装する**

passは合格、incomplete／html-only／wrong literalは`incomplete`、syntax／securityは`code-error`、timeoutと基盤障害は不正解ではなく停止／`system-error`として扱う期待値を記録する。solutionとFixtureは公開Lesson manifestへ混入させない。

- [ ] **Step 6: content compileとreviewをGREENにする**

Run: `./scripts/docker-compose.sh run --rm app npm run content:compile`

Run: `./scripts/docker-compose.sh run --rm app npm run content:review`

Run: `./scripts/docker-compose.sh run --rm app npm run test:run -- scripts/content`

Expected: JavaScript Courseを含むcompile、review、content testが全PASS。

### Task 7: 3ブラウザSecurity、Accessibility、性能Gate

**Files:**

- Create: `e2e/javascript-learning.spec.ts`
- Create: `e2e/javascript-security.spec.ts`
- Create: `e2e/javascript-errors.spec.ts`
- Modify: `e2e/helpers/routes.ts`
- Modify: `tests/performance/learning-performance.spec.ts`
- Modify: `scripts/check-learning-chunks.ts`
- Modify: `scripts/check-learning-chunks.test.ts`
- Modify: `vitest.bundle.config.ts`
- Modify: `content/javascript/performance.yaml`

**Interfaces:**

- Consumes: Task 5のroute、Task 6の直接URLとFixture。
- Produces: browser matrix、security request monitor、bundle graph、p95性能のrelease gate。

- [ ] **Step 1: JavaScript基本操作E2Eを書く**

Chromium、Firefox、WebKitで直接URLを開き、`script.js`初期選択、highlight、編集、Preview、判定、Reset、Review復帰、自動保存を検証する。HTML-only spoofが不合格で、正しいJavaScriptだけが合格することを確認する。

- [ ] **Step 2: Security payload E2Eを書く**

`fetch`、XHR、WebSocket、Beacon、image external URL、form、popup、top／parent、Storage、Service Worker、self-navigation、forged postMessage、stale token、別revision、無限Loopを投入する。外部request 0、親画面操作不可、frame停止後も再試行CTAが操作可能であることを確認する。

- [ ] **Step 3: Accessibilityとviewport E2Eを書く**

Keyboard-onlyでFile tab、Editor、Error summary、Hint、Resetへ移動し、`axe` critical／serious 0を確認する。1280x720はdocument overflowなし、390x844はdocument水平overflowなしでStage内部だけがScrollすることを数値assertする。

- [ ] **Step 4: lazy graphとperformance gateを追加する**

Home／Path／HTML Slideのmanifest graphに`acorn`、`magic-string`、JavaScript Runner、CodeMirror JavaScriptが含まれないことを検証する。JavaScript exercise graph gzip 180,000 bytes以下、Preview p95 500 ms以下、判定p95 1,000 ms以下を3回以上の測定でGate化する。

- [ ] **Step 5: 対象Gateを実行する**

Run: `BASE_PATH=/tsumucode/ ./scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:e2e -- e2e/javascript-learning.spec.ts e2e/javascript-security.spec.ts e2e/javascript-errors.spec.ts`

Run: `BASE_PATH=/tsumucode/ ./scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:performance`

Run: `./scripts/docker-compose.sh run --rm app npm run smoke:learning-chunks`

Expected: 3ブラウザ、security、Accessibility、性能、bundle gateが全PASS。

### Task 8: 全回帰、実画像、push、GitHub Pages beta公開

**Files:**

- Modify: `docs/quality/javascript-vertical-slice-design.md`
- Modify: `docs/quality/visual-review.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`（既存運用がある場合だけ）

**Interfaces:**

- Consumes: Task 1〜7の完成Artifact。
- Produces: 受け入れ条件チェック、release evidence、日本語commit、remote main、公開URL。

- [ ] **Step 1: 全DoDをDocker内で実行する**

Run: `BASE_PATH=/tsumucode/ ./scripts/docker-compose.sh run --rm -e BASE_PATH app npm run check`

Run: `BASE_PATH=/tsumucode/ ./scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:e2e`

Run: `BASE_PATH=/tsumucode/ ./scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:performance`

Run: `BASE_PATH=/tsumucode/ ./scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:lighthouse`

Run: `./scripts/docker-compose.sh run --rm app npm run release:check`

Run: `./scripts/docker-compose.sh run --rm app npm run smoke:subpath`

Expected: lint、type、全Unit／content、build、3 Browser、security、performance、Lighthouse、static artifact、subpathが全PASS。

- [ ] **Step 2: 2 viewportの実画像と境界数値を確認する**

1280x720と390x844で4 Slide、Exercise、Error、Hint、Reset dialogを撮影し、画像を目視する。documentとStageの`scrollWidth/clientWidth`、footer／CTA／Editor／Preview境界を数値記録し、重なり・切れ・操作阻害がないことを`docs/quality/visual-review.md`へ記載する。

- [ ] **Step 3: 設計受け入れ条件を証拠付きで完了する**

`REQ-JS-001`〜`REQ-JS-018`をテスト名、計測値、Artifact hashへ対応付ける。非対象、リスク対策、性能目標を維持し、設計状態を`実装・検証済み`へ変更する。

- [ ] **Step 4: secret scanと日本語commitを行う**

`origin/main..HEAD`全差分と履歴を対象に秘密鍵、GitHub／OpenAI／AWS／Google／Slack token、credential URL、JWT、機密filename、5 MiB超Fileを検査する。生成物、solution、Fixtureの公開Artifact混入も検査する。

Run: `git commit -m "追加: JavaScriptの安全な実行と最初の教材を実装する"`

- [ ] **Step 5: mainへpushしremote一致を確認する**

Run: `git push origin main`

Run: `git ls-remote origin refs/heads/main`

Run: `git rev-list --left-right --count origin/main...HEAD`

Expected: local HEADとremote SHA一致、ahead／behind `0 0`。

- [ ] **Step 6: GitHub Pages betaを公開する**

Run: `gh workflow run "TsumuCode Pages" --ref main -f source_sha=<Task 8 commit SHA> -f release_mode=beta -f deploy=true`

Expected: resolve、quality、deploy、verify jobがすべてsuccess。

- [ ] **Step 7: 公開URLをcache-bustingして確認する**

`https://santa928.github.io/tsumucode/?verify=<Task 8 commit SHA>#/courses/javascript/lessons/javascript-ch00-l01/slides/javascript-ch00-l01-s01`とExercise直接URLを開き、Catalog v3、JavaScript Lesson manifest、lazy chunkの200、console error 0、外部request 0、Preview／判定成功を確認する。

## Self-Review

- Spec coverage: REQ-JS-001〜018はTask 1〜8へ対応済み。Chapter 01以降は設計どおり非対象。
- Placeholder scan: 実装未定を示す`TBD`、曖昧な「適切に処理」、他Taskへの省略参照は含めていない。
- Type consistency: `RunnerEvidence`はRunner→Controller→`ValidationContext.evidence`→JavaScript Validatorの同一名称で統一した。
- Release boundary: 設計、実装、全回帰、secret scan、push、Pages、live verificationをTask 8へ明示した。
