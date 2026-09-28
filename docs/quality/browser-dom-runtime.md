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
