# Browser DOM実行の境界

Issue #29のDOM側で、既存iframe Runnerへnative `Event.currentTarget`の保護と非採点診断を接続する。Event全体をProxyへ置き換えず、通常のイベント処理と既存の隔離・予算を維持する。

## 対応と診断

- dom profileで、同じDocumentのElementに登録したイベントのcurrentTargetと、dispatch後のnullを返す。未接続Element、子targetと祖先currentTarget、functionのthis、handleEvent、once/removeを維持する。
- async / project profileのcurrentTargetは遅延callback後の診断連携が未対応のため、解析時にunsupportedとして実行前に停止する。他の既存async機能は維持する。
- Document等へのlistener登録とevent.targetの利用は維持する。非ElementのcurrentTarget取得は未対応を記録してthrowする。学習コードがcatchしても、同じframeの後続操作が成功しても、この状態を消さない。次の実行で新しいframeを作ると解除する。
- native getterの保護に失敗した場合、学習コードを開始せずシステム障害を通知する。初回実行と操作応答の双方に必須の有限状態を渡し、欠落・未知値を正常として受理しない。
- 未対応・システム障害は採点へ渡さず、過去の履歴・成功snapshotを保持する。編集・Resetに伴う現在の合格状態の失効は通常どおり行う。
- ObjectPatternのkeyにも既存Member policyを適用する。ownerDocument/defaultView等への分割代入を含む参照を拒否する。安全なpropertyを受け取る変数の名前はブラックリスト化しない。

## 操作採点と保存の共通契約

既存Validatorは操作checkpointを `interaction:<scenario>:<checkpoint>` に集約し、個々のcheckは末尾に `:<expectation>` を付ける。保存側が通常ruleだけを許容していた不整合を修正する。

検証済みExerciseから、合格・失効用の集合と、Index・履歴・移行参照用の集合を共通に導出する。合格集合は通常のgroupIdまたはrule IDとcheckpoint ID。参照集合には通常rule/groupとexpectation IDも含む。未知ID、別ExerciseのID、expectationを合格集合に混ぜた結果を拒否する。同じCourseの別Exercise間（別Lessonを含む）でcheckpoint合成IDが衝突する定義も拒否する。

合成IDの形式はrule参照にだけ限定し、共通IdSchemaは緩めない。正規CompilerのIndex生成と既存Manifest移行の参照集合も同期する。履歴checkのruleIdと集約requirementIdの両方へ既存rule移行を適用し、どちらかのresetではcheckを理由付きで隔離する。保存形式・revision方式や移行アルゴリズムの作り直しは行わない。

## 確認範囲と残る制限

製品RunnerのChromium・Firefox・WebKitでnativeイベント契約、catch後も継続する未対応、初回発火の診断、保護設置失敗、同期loopの停止と新frame再試行を対象検証する。UIではテスト限定DOM Lessonを正規Compilerで分割生成し、合格保存・未対応非保存・reload・修正再判定・Export/Import・Resetを確認する。このfixtureを新教材の公開や人による試用実績とは扱わない。

DOM側の変数添字など既存AST制約は残る。DOM実行全般の互換性・安全性を保証する変更ではない。CSP、opaque origin、認証、AST policy、予算制限を維持する。人による初心者観察と実機確認は別の未確認項目。Console側の経緯は[Browser Console設計記録](browser-console-runtime.md)を参照する。

## Event教材のFixture実操作（Issue #8）

Ch08で操作後の結果を採点する前提として、Course Fixture Gateを実操作へ接続する。

| 要件                | 区分 | 対応                                                                                |
| ------------------- | ---- | ----------------------------------------------------------------------------------- |
| REQ-DOM-FIXTURE-001 | 追加 | Scenario付きSolution/誤答を実Runnerのclick/fill等で実行し、実Snapshotから判定する   |
| REQ-DOM-FIXTURE-002 | 維持 | 各Scenarioはfresh frame、session/revision/frame/requestとviewportを照合する         |
| REQ-DOM-FIXTURE-003 | 維持 | 初期Snapshotと操作後checkpointを分け、最大750ms/50ms間隔の観測・timer保持を維持する |
| REQ-DOM-FIXTURE-004 | 維持 | 古い処理・環境未対応・システム障害を学習履歴の不正解に変換しない                    |

`runInteractionScenario`を学習ControllerとFixtureで共用する。FixtureはNode側からBrowserの実Runnerへ要求を渡し、製品と同じcheckpoint評価を使う。成功結果やDOMを合成しない。Fixture中は編集を並行実行しないため、鮮度callbackのみno-opで、返却identityの照合は共通処理で行う。製品の鮮度確認と保存処理はControllerが引き続き担当する。

実操作の回帰用HTMLは教材完成の証拠とは区別する。新教材・新しい操作種別・sandbox/CSPの緩和はこの変更の非対象。受入は実click/fill、Scenario間の状態独立、初期表示だけを完成させた誤答、誤イベントの不合格と既存Controller回帰。性能の待機上限は既存値を維持し、Home/読書への重い実行依存の混入はchunk境界検査で確認する。

### iframe操作と編集権の再確認

プレビューから親画面へフォーカスが戻る場合も、永続LeaseのCAS再確認を行う。同じowner tokenを再確認する `revalidating` phaseではRunner・iframe・Editorを保持する。新規writeは従来どおり拒否し、開始済み保存のsettleと限定されたflush fenceだけを維持する。実譲渡・所有権喪失・再claimでは従来の破棄経路へ戻る。

Resetの確認画面を開く操作は保存を行わないため再確認中も受け付ける。コードの復元・保存を実行する確認ボタンは、編集権を再取得するまで無効とする。focusイベントの除外やLease期限の緩和は行わない。

## Formのnative submitと取消採点（Issue #8）

| 要件         | 区分 | 契約                                                                                                                                      |
| ------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FORM-001 | 追加 | `dom-form`だけsandboxを`allow-scripts allow-forms`とし、native click/Enterのsubmit lifecycleを扱う。既存profileのsandboxは維持する        |
| REQ-FORM-002 | 維持 | opaque origin、CSPの`form-action 'none'`/`connect-src 'none'`、通信属性除去、JS送信API・URL変更の拒否、trusted capture取消を保つ          |
| REQ-FORM-003 | 追加 | native取消とは別に、同じnative submit Eventで学習handlerが実行したpreventDefaultだけを観測する。guard設置失敗はsystem診断で採点保存しない |
| REQ-FORM-004 | 追加 | 認証Interaction単位の有限観測を`submit-prevented`期待へ接続する。無操作・別Event・過去Event・未実行コードを成功としない                   |
| REQ-FORM-005 | 維持 | Scenarioはnative button.clickを用いる。synthetic Enterからsubmitを生成しない。手操作のEnterは実ブラウザで別に確認する                     |
| REQ-FORM-006 | 維持 | ID・保存形式・実行予算・未対応と不正解の区別を保ち、初期描画と操作後の判定を分離する                                                      |

HTML Snapshot Bridgeは学習codeより前にnative `preventDefault`を捕捉し、document captureで送信を取り消す。Form側はimmutable wrapperとprivate closureで学習者の呼出しを記録する。既存のcallback予算wrapper・listener identity対応表を使い、Form独自のlistener再実装は追加しない。`defaultPrevented`は安全装置によってもtrueになるため合格の証拠にしない。1操作につき最大16件のnative submitを保持し、nested submitを含め全件の学習者取消が必要。超過・未発火・異なるEventは合格にしない。

取消が本来効かないpassive listenerを誤認しないため、dom-formの`addEventListener`は非computedの直接member呼出し、静的Event名、第3引数は省略またはboolean literal（capture）だけを受け付ける。Object/dynamic options、alias/bind/call/apply、分割代入での抽出はunsupported。既存dom profileのoptionsは変えない。Object optionsを教える場合は別途拡張と独立検証が必要。

Protocol v3は初回/操作応答の`submitEvidence`を4値（unsupported/setup-error/prevented/not-prevented）に固定し、欠落・未知値・旧versionを拒否する。submit期待はdom-formでだけ定義でき、観測取得不能はScenarioを中断する。非永続のEvent参照や内部tokenを学習者へ渡さない。Profile切替・前回成功表示の復元ではsrcdocとsandboxを一緒に保持する。

受入検証は実Runner/Validatorの正解・取消忘れ・到達不能・別イベント、実click/Enter、入力後送信、stopPropagation/stopImmediatePropagation時の安全装置、悪性action/formaction/target/method/scheme、通信/親子遷移/popupの抑止、隔離文書で製品CSP単独の送信拒否を3ブラウザで確認する。allow-formsがなくてもWebKitはsubmitイベントを届け得るため、従来domのイベント不発自体を契約にしない。認証Interactionの待機・予算上限、Home/読書chunk境界を維持する。

この変更でForm教材や人による初心者試用が完了するわけではない。FormData、requestSubmit/submit API、async submit、任意listener options、constraint validationの教材化、外部送信は非対象。教材は別PRでこの実採点経路へ接続する。

## Ch10の直接Promise constructor（Issue #8、レビュー前の候補）

| 要件                  | 区分 | 契約                                                                                                                                                                                             |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-ASYNC-PROMISE-001 | 追加 | async/projectだけ直接のnew Promiseを許容し、executor/then/awaitと既存bounded timerを接続する                                                                                                     |
| REQ-ASYNC-PROMISE-002 | 維持 | core/modules/dom/dom-formではunsupported。async/projectではPromiseの束縛・再代入を拒否し、標準Promiseへの直接newだけを追加する。任意constructor・alias・member constructor・動的実行は開放しない |
| REQ-ASYNC-PROMISE-003 | 維持 | 通信/Storage/親参照拒否、opaque iframe/CSP、計装の予算、timer数/遅延上限、stop/新frame失効を維持する                                                                                             |
| REQ-ASYNC-PROMISE-004 | 維持 | currentTargetのasync/project制限、未対応/システム障害の非採点、下書き保持、Home分離を維持する                                                                                                    |

これはConsole専用Runnerの証拠をDOMへ流用する変更ではない。直接のPromise constructorを既存AST policyの有限許可へ追加する候補であり、全Promiseがsettledになるまで待つ契約や任意コードの完全隔離を新設しない。遅延DOM観測は既存Scenarioの750ms上限とpreserveTimersに従う。初期Snapshotでtimerを回収する既存契約も変えない。

受入は実Runnerで直接resolve/reject捕捉・timerからのresolve・async/await・再実行/stop後の古い結果抑止と、関連の拒否境界を代表Browserで確認する。初期実測ではnew Promiseがunsupportedで、既存Promise.resolve().thenのDOM更新のみ動作した。人の初心者試用・教材完成・公開はこの修正の証拠に含めない。既存性能/待機上限は維持する。

PR63の独立レビューで、`const Promise = Date; new Promise()`が名前だけのconstructor検査を通る点を確認した。async/projectではPromiseを予約名として扱い、変数宣言・関数名・引数・分割代入・catch・import・代入・更新・for-in/ofの束縛先を実行前にunsupportedとして拒否する。`object.Promise`や`{ Promise: other }`のproperty名は束縛先と区別して許可する。これは教材環境の制限であり、JavaScript一般で同名の変数を禁止する説明ではない。

| 改訂対象                      | 区分 | 差分                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------ |
| REQ-ASYNC-PROMISE-002         | 維持 | 標準Promiseだけを許可するため、名前の置き換えによる迂回を閉じる          |
| REQ-ASYNC-PROMISE-001/003/004 | 維持 | executor/then/await、待機・予算・隔離・失効・下書き・chunk境界を保持する |
