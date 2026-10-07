# React Form・共通親Stateの教材契約（Issue #119）

React導入Courseへ入力FormとState共有の2単元を追加する。Course・内容レビュー台帳はdraftを維持し、正式公開の受入は別タスクとする。

## 教材と学習判定

l06はcontrolled inputのvalue/onChange、型付き送信EventのpreventDefault、name/attemptedからの検証表示と文字数を扱う。Starterでは送信取消だけを修正する。空値・空白・異なる長さの入力、送信、やり直しを操作し、表示だけの一時一致で合格させない。

l07は共通の親Appに文字列Stateを置き、兄弟NameField/NameSummaryへ値と更新callbackを渡す。Starterの固定Propsを修正し、要約と文字数を描画時に導出する。両子の実描画インスタンスに入力・要約・文字数の由来を結び、空の子と親の代替DOMでは学習条件を満たさない。表示用trimの別解は許容し、入力valueは親の元の値に結ぶ。

2単元とも予測・修正課題、3段階Hint、Solution、正負Fixture、公式出典を登録する。固定/stale表示、二重State、不要なEffectによる同期とEventの持越しを代表負例として区別する。これは用意済み構造の限定修正であり、一般Reactアプリを独力で設計できる保証には広げない。

## 有限Runtime

`controlled-form-v1`は`controlled-form`と`shared-state`だけを扱う。編集可能components.tsxと読み取り専用main.tsx/types.ts/index.htmlの4Fileを、Compiler・Runner・Validatorで照合する。固定React 19.2.7のuseState、型定義のChangeEvent/SubmitEvent、readonlyなFormState/Propsを使用する。

Appの1つのStateと最大2個の型付き純粋子、閉じたJSX、同期onChange/onSubmit/onClickへ限定する。入力handler内でcurrentTarget.valueを文字列へ読み、親setterへ渡す。EventオブジェクトやcurrentTargetの保持、updater内のEvent読取り、任意import/DOM/async/Effect/再帰/any/型検査抑制を拒否する。重複idも拒否する。名前・import alias・handler宣言/inline・Propsの受取り方と純粋な更新の別表記は許容する。この有限範囲を一般Reactの制約として説明しない。

Compilerは学習者をWorker内で実行せず、ASTと実型検査から5個の厳密な真偽値factを返す。ValidatorはSource/session/revisionの一致、profile/goalの一致、学習fact、実DOMと全操作checkpointをANDで採点する。Scenarioの省略・期待値変更・別目標への差替えはauthoringと公開Schemaの両方で拒否する。

新profileだけ下層の`dom-form`で送信取消を観測する。既存JSと旧React profileの能力は維持する。採点は実submitボタンのnative clickで同じEventの取消を観測し、通常UIのKeyboard検証はブラウザ本来の入力Enterを使う。Bridgeの合成key actionを暗黙submitの証拠にはしない。

信頼済みbundleは5exportを維持し、onChange/onSubmitの元例外を既存の失敗専用通知へ渡す。学習者へ通知関数や成功証拠の生成能力を開放しない。

## 保存と検証

revision 2026-10-07.2から2026-10-07.3へ空stepsの移行edgeを追加する。旧5単元のSource hashを保持し、既存の編集Source・Hint・cursor・判定履歴・passingSnapshotを保存する。一時的なReact Stateは新しいrunで初期化する。

`react-form-fixtures.spec.ts`は実Worker/Compiler/React/Scenario/Validatorで18の正負Fixture、元例外と次run回復、Source不一致、固定型改変拒否を確認する。`react-form-runtime.spec.ts`はlabelによる入力、本物のEnter送信、エラー案内、Keyboard Hintとfocus復帰、判定、全文Source保存・再読込・Reset、390pxの7Slide/PC案内とaxeを確認する。境界AST、strict fact guard、Scenario改ざん拒否、旧進捗保持はUnit/Contentで検証する。独立Reviewerの読解・作者の実行証拠・実画像確認は区別して記録する。
