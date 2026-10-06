# DOM・unknown・非同期の初回3課題の採点契約

Issue #113。通常draftのChapter 05にだけ適用する有限の契約。一般のTypeScriptや任意のDOMプログラムを判定するものではない。

| Lesson   | profile           | 元TSで確認する関係                                                                                           | 実DOMで確認する操作                      |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| ch05-l01 | dom-event-v1      | EventのcurrentTargetをHTMLButtonElementへ絞り、実datasetを返す。querySelectorのnull確認後にhandlerを接続する | 回答buttonのclickで2を表示               |
| ch05-l02 | unknown-points-v1 | unknownをobject・非null・pointsの存在・numberで確認し、実値をStringへ渡す                                    | 数値は2、文字列とnullは不正なデータ      |
| ch05-l03 | async-unknown-v1  | Promiseのunknownをawaitして既習の検証へ渡し、catchのunknownをErrorで確認して実messageを使う                  | 正常2、不正なデータ、拒否の案内、再試行2 |

型検査、有限な学習条件、初期Console、初期DOM、実操作のcheckpointをすべて満たして合格する。Consoleの「準備できました」は接続の準備だけを示し、DOMの動作証拠を代用しない。値を3へ変えた正しい型処理は型条件が通っても操作結果で未達になる。表示を固定したり、未使用の正しい関数を置いたりして型条件を代用できない。

## 元TSの有限検査

停止可能な既存Compiler Workerでstrictの実Compilerを使う。型失敗では生成JSを実行しない。学習検査は元TSのコピーを非emit検査し、Runner・保存データへ検査コピーやASTを渡さない。Workerの返却はprofileと7個のboolean factだけで、別profile、余分なpayload、成立しないprobeの組合せを拒否する。

対象はmain.ts一つ、8,192文字・2,048 AST node・深さ64まで。予約接頭辞、lib欠落、予算超過はsystem-error。any、as、型assertion、非null assertion、型診断の抑制は学習条件を満たさない。実Compilerが通ることと、型を弱めずに値を確認して使うことを区別する。

明示された引数・戻り値を持つ関数宣言、blockを持つarrow/function式、名前の変更、式の括弧を受け入れる。DOMは正のinstanceof分岐または負の早期return、unknownは4条件のANDまたは順に確認する早期returnを受け入れる。固定されたquerySelector、null確認、click登録と実表示への接続を確認する。async課題はLoadModeの3literal、load→await→formatPoints→表示、Errorのternary分岐を確認する。任意の制御構造や関数順序、別のAPIへの置換は対象外で、一般には正しくてもこの初回課題では未達となり得る。

各profileの合法な正probeは2件、負probeはDOM2件・unknown2件・async3件。元関数への呼出しと、戻り値/引数の型の誤用を実Compilerで確認する。負probeは予定されたファイル・行・診断コード・件数まで照合する。型条件と動作を独立して確認するため、同梱数値やError messageの変更だけで型条件を失敗にしない。

## 実行と教材契約

既存のTypeScriptRunnerAdapterと隔離JavaScript Runnerを利用する。DOMの2課題はdom、非同期課題はprojectの既存能力を使い、新たな通信・constructor・DOM権限を開放しない。外部APIや常駐サーバーは使わず、同梱値だけで成功・不正・拒否を再現する。非同期の検証用別解は1〜500msの有限なPromise/setTimeout待機だけを受け入れ、既存の停止上限を維持する。

AuthoringでTSのInteraction Scenarioを許可する範囲は固定3Exerciseだけ。runtime・単一scenario・操作順序・selector・checkpoint・期待値の省略や変更をSourceとValidatorの両方で拒否する。他のTS課題へ流用したり、Console能力へ変えて操作条件を省略したりできない。JavaScriptの既存Interaction制限は維持する。

製品とFixtureで同じrunInteractionScenarioを使い、実clickと認証されたSnapshotだけからcheckpointを評価する。session/revision/frame generation/request identityを照合し、各操作後の観測は最大750ms。元TSのhashと生成JSの証拠を照合し、編集・停止後の旧結果を新ソースへ合格保存しない。失敗後もTS原文を保持して修正・再試行できる。

Solution/Fixture/検査コピーは配信しない。Courseはdraftのまま。3Lesson各20分、累計225分は推定で、初心者の通し試用や正式公開受入の代用ではない。

## 説明の一次資料

- [TypeScriptのnarrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)：typeof、in、instanceofとnullの確認。
- [TypeScriptのFunctions](https://www.typescriptlang.org/docs/handbook/2/functions.html)：unknownと非同期のPromiseの型。
- [TypeScript 4.4](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html)：strictでのcatch変数のunknown。
- [DOM操作](https://www.typescriptlang.org/docs/handbook/dom-manipulation.html)：querySelectorで対象がない場合のnull。
- [MDN currentTarget](https://developer.mozilla.org/en-US/docs/Web/API/Event/currentTarget)：登録先と出発点の違い、handler中の参照。

2026-10-06に該当箇所を確認し、自作の小さい例と日本語説明へ反映した。assertionは実行時の検証や変換を行わないと説明する。
