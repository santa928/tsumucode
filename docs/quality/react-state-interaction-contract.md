# React Event・State・List/Keyの教材契約

Issue #118の2単元（react-ch01-l04 / l05）を、型検査・Sourceの学習条件・実操作後の表示のANDで判定する。Courseとレビュー台帳はdraftを保つ。Form・Stateの持ち上げ・Reducer/Context・Ref/Effect・正式公開は後続タスクで扱う。

## 実行と責務

`interactive-state-v1`は1つの数値Stateまたはreadonly Topic配列Stateと、同期clickを扱う。編集可能なcomponents.tsx、固定main.tsx・types.ts・index.htmlの4FileをUIだけでなくCompiler/Runner/Validatorでも照合する。useStateは既存lockのReact 19.2.7から固定bundleへexportし、JSX runtime・createRootと合わせた5exportの自己完結moduleをbuild時に検証する。旧Props・静的Component profileではuseStateのimportを認めない。

Compiler Workerは学習者コードを実行せず、有限TSX ASTの能力検査と固定TypeScript/@typesによる実compileを行う。Appの先頭で1つのuseStateを受け取り、数値またはreadonly Topic[]を指定する。初期値はLiteralと項目配列、表示は用意済みの意味的HTML要素。直接DOM・URL・ref・非同期・任意import・loop・再帰・型抑制・any・assertionを認めない。ASTは2048Nodeまで。既存のSource容量・Compiler/Analyzer/Runner/観測期限は変更しない。

SetterはbuttonのonClickへ渡した同期handler内で使う。更新関数は副作用なしで次の値を返し、その中のSetterを拒否する。数値の式、配列Literal/spread・filter・map・toReversedと、新配列に対するreverseを許容する。配列Stateと項目はreadonly型で保護し、直接push/reverseや書込みは能力検査でも拒否する。内部名、useStateのimport alias、handlerのinline/関数宣言、Stateを直接読む更新/更新関数の違い、元配列をコピーして並べ替える別解は許容する。この範囲は一般Reactの規則ではなく今回の安全な教材profileである。

## 学習条件と操作

Compilerの厳密なbool factは、同じStateの表示とEvent更新、#twiceへ接続する同一handler内の前値+1の純粋updater2回、新配列を返す更新、実際に描画するState.mapのitem.idに由来するKeyを表す。未使用handlerは能力検査しても学習factへ数えない。Keyの位置index・固定値・欠如は表示が一致しても学習条件を満たさない。data-idも描画項目のidへ結び、観測用属性の固定値による偽装を拒否する。

Validatorは同じ全Source/profile/session/revisionのhashを照合して再compileし、初期DOMと必須の操作Scenarioを既存JavaScriptValidatorで評価する。操作全体の省略・変更・別目標のScenarioへの差替えはauthoring/public SchemaとValidatorで拒否する。Scenarioは既存runInteractionScenarioを再利用し、fresh iframeで実clickを送る。世代・requestId・revision・viewportを照合したSnapshotを最大750ms観測してReactのcommitを待つ。

- Counter: 初期0、通常clickで1、もう一度2、1操作内の更新関数2回で4。1度だけ正しい固定更新や、同じ数値への2回置換は通らない。
- List: 初期HTML/CSS、JS追加、再追加でも重複なし、HTML削除、逆順、JS削除、再追加。各段階で一覧全体の文字と各項目のdata-idを観測し、順序・件数・ID保持を確認する。残す項目のIDを作り直す変更や重複IDは通らない。

初回renderの同期例外は既存createRoot wrapperでthrowする。更新時にReactが捕捉した描画例外はtrusted wrapperから固定moduleにだけ注入したlexical通知でBridgeへ記録する。同期Eventの学習者例外もtrusted jsx/jsxsのcallback wrapperが元例外を同じ通知へ渡す。グローバルのdispatchEvent等は開放せず、通知は失敗の記録だけを行う。Bridgeはwindow errorと未捕捉拒否も同じbounded runtimeErrorへ記録し、同世代のInteraction/観測の診断に含める。Eventで一度表示を更新してからthrowする負例も成功扱いにせず、新しいrunで回復できる。停止・編集・再描画では旧Worker/iframeとStateを破棄し、既存generation契約で旧応答を返さない。永続保存するのはSourceと進捗で、一時的なReact Stateは新runで初期化する。

## 教材・検証・残る受入

l04はEvent/Stateと更新関数の予測・修正、l05はimmutable updateとList/Keyを扱う。説明・予測問題・3段階Hint・Solution・妥当な別解・固定表示/固定更新/例外/直接mutation/index Key/Key欠如/重複IDの正負Fixtureを独自制作し、[公式React資料](../../content/react/references/react-official.md)へ出典を記録する。旧revisionからの空steps移行edgeで、既存Source・履歴・Hint・cursor・passingSnapshotを保つ。

`react-state-fixtures.spec.ts`は実Worker・Compiler・React/DOM・Scenario・Validatorを通して全Fixtureのstatus/診断/失敗Ruleを検証する。有限learner文法では到達しない更新描画のthrowはテスト用Compiler portで実compile後のJSを差し替え、製品のReact/Analyzer/opaque iframe/Bridgeで元例外と次run回復を確認する。DOMや診断のmockではなく、通常の教材コードとして受理することを意味しない。`react-state-runtime.spec.ts`はPCの実click・Keyboard操作・採点・保存/再読込/Resetと、390pxの7Slide・PC案内・axeを確認する。更新描画エラーの通知、有限Source契約、strict fact guard、操作省略拒否、進捗移行は関連Unit/Content testで確認する。独立Reviewerは全原稿・コードと作者の実行証拠・代表画像を確認する。

Home/SlideからCompilerと演習を遅延分離し、既存512000 bytesのgzip上限を維持する。Home増分の既存warningは記録し、基準を緩めない。Firefox/WebKit、物理実機、人の初心者観察、全React Course受入と正式公開は#123に残す。
