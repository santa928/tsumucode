# Questionのinterface型関係の作者向け試作

Issue #11、設計案の`typescript-ch02-l01`に向けた少量の独立技術検証。2026-10-02。通常Lesson、製品の型習得採点、Course/Catalog/Pathへは接続しない。27Lesson/595分と新しい型条件契約の全量提案は未承認のまま保持する。指定Pro Chat継続先の本人返答待ちでも進められる範囲として、固定した12原稿の観察と、次の小教材のBrief・4枚の作者原稿・1演習の案を作る。

## 要件台帳と差分

| ID                        | 区分 | この試作の受け入れ条件                                                                                                     |
| ------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| REQ-TSC-001               | 維持 | interfaceとオブジェクト型を型推論/注釈/消去の後に扱う。全15Topicを減らさない                                               |
| REQ-TSC-004/008           | 維持 | 通常型検査成功、元TSの学習条件、動作成功を区別。生成JSだけを型習得の証拠にしない                                           |
| REQ-TSC-009/010           | 維持 | 製品の安全/保存/遅延読込/既存Gateを変更せず、初心者/実機/正式公開受入を自動検査で代替しない                                |
| REQ-TS-QUESTION-PILOT-001 | 追加 | Questionの必須3フィールドを通常Compilerと正負の非emit検査で観察する                                                        |
| REQ-TS-QUESTION-PILOT-002 | 追加 | any/optional/unionへの拡大、type alias/推論/改名、範囲外値を制御例として比較する                                           |
| REQ-TS-QUESTION-PILOT-003 | 維持 | コピーと検査専用fileをRunner、保存、学習画面へ渡さない。任意sourceの採点器として公開しない                                 |
| REQ-TS-QUESTION-DRAFT-001 | 追加 | 既存Briefに沿う4枚の作者原稿と1演習・3段階Hintを用意し、掲載6sourceの型診断を実Compilerで照合する                          |
| REQ-TS-QUESTION-EXEC-001  | 追加 | 掲載6sourceのhashを固定し、作者の型成功3sourceだけ実Nodeで実行し、標準出力を照合する。学習者RuntimeやDOMの実証には使わない |

既存要件の保留・削除はない。追加4件は固定原稿の作者向け観察と未登録の少量教材原稿だけで、製品の受入条件や性能予算を増やさない。#8〜10のJS受入、TS全量設計/型条件契約の独立レビュー、初心者の観察は未完条件として維持する。

## 次の小教材のBrief

前提はJSのオブジェクト/配列/添字とTS導入01-01〜03。interfaceはオブジェクトの形に名前を付ける書き方で、プロパティ名と型を記述する。type aliasや匿名のオブジェクト型にも共通する形の検査があり、interfaceだけを一般に安全と説明しない。[TypeScript Handbook: Interfaces](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#interfaces)

教材は、問題文`prompt: string`、選択肢`choices: string[]`、正答の位置`correctIndex: number`を持つQuestionを扱う。`string[]`は文字列を要素に持つ配列だと初出時に説明する。後続のtype alias/optional/Literal/unionを理解済みの前提にしない。対照Fixtureの高度な構文は作者の観察用で、初回教材の説明量へ一度に追加しない。

4枚の構成案は、(1)値のオブジェクトと形の名前、(2)必須フィールド不足、(3)フィールドの誤型を直す予測、(4)正答位置が配列の範囲内かは別に確かめる説明練習。作者用の4枚と1演習の原稿をdocs/quality/typescript-question-interface-draftへ具体化したが、通常Slideの登録/表示検証済みという記録ではない。20分は全量設計案の見積りで、初心者の読了実測ではない。

初回演習でinterfaceの練習を要求するなら、型の形の検査だけに加え、元TSで注釈されたinterfaceと結び付くことを確認する必要がある。型名の改名は学習目標を変えないため許容候補とする。type aliasと推論は一般には有効なTSで、この教材だけの学習条件との違いを課題説明に書く。今回その製品Ruleは実装していない。

## 検証の入力と境界

`tests/fixtures/typescript-question-interface-pilot.json`は作者が固定した単一`main.ts`/トップレベル`question`の12原稿。`scripts/content/probeTypeScriptQuestionPilot.ts`は既存固定Compiler6.0.3と同versionの標準libを使用し、通常の`compileTypeScript`で原文を検査する。

型が通る9原稿だけ、別コピーへ固定`export { question }`を加え、信頼側の非emit `checkTypeScript`で2つの正例と6つの負例を確認する。正例は別内容の通常の問題と、空文字/空配列/範囲外位置10を含む形の一致。これを有効なクイズデータの受入証拠とはしない。負例は3フィールドそれぞれの欠落と誤型。

負例は検査専用fileの独立した6変数に置く。診断のfile/line/column/codeと固定した関係IDを対応させ、別fileの型誤り・環境/構文エラー・重複や無関係な診断を負例成功へ数えない。欠落は2741、誤型は2322を期待する。成功時の非emit結果は`{ status: 'valid' }`だけで、生成JSやsource mapが無いことも確認する。

元TSの観察は、`question`の直接型注釈がトップレベルinterfaceへつながるか、anyの型構文があるかだけ。名称の単純一致による固定原稿の観察であり、symbol解決・任意grammar・型assertion/診断抑制・複数file・型宣言merging・名前衝突を安全に分類する製品採点器ではない。未知入力へ流用しない。生成JSの比較も型習得の判定には使わない。

| 原稿                         | 通常型検査      | 6負例の拒否         | 直接interface注釈 | 意味                                             |
| ---------------------------- | --------------- | ------------------- | ----------------- | ------------------------------------------------ |
| solution / renamed-interface | ready           | 全6                 | あり              | 名前を変えても同じ型関係                         |
| type-alias / inference-only  | ready           | 全6                 | なし              | 形の一致だけではinterfaceの練習を区別できない    |
| any-escape                   | ready           | 0                   | なし              | 通常compileと表示だけでは迂回が分からない        |
| optional-index               | ready           | 5、位置欠落は受理   | あり              | interfaceの存在だけでは必須条件を保証しない      |
| wide-index                   | ready           | 5、文字列位置は受理 | あり              | number限定をunionで広げる差を負例で観察          |
| out-of-range / wrong-value   | ready           | 全6                 | あり              | 型の形が合っても位置の範囲や課題の正しい動作は別 |
| missing-index                | type-error 2741 | 検査コピーなし      | あり              | 元原稿の型誤り、JSを返さない                     |
| wrong-index / wrong-choice   | type-error 2322 | 検査コピーなし      | あり              | 元原稿の誤型、JSを返さない                       |

## 実測と再現

既存Dockerで12原稿の通常compile、9原稿の正負検査が一致。正例18代入/負例54代入を観察し、予想した拒否関係だけを確認した。solutionと改名/type alias/推論/any/optional/unionの6原稿は生成JSも同じ。anyの負例受理、optionalの欠落受理、unionの文字列受理、形が同じでも範囲外/別内容が型を通ることを実測した。

再現はプロジェクトDocker手順で `./scripts/docker-compose.sh run --rm app ./node_modules/.bin/tsx scripts/content/probeTypeScriptQuestionPilot.ts`。同じ固定依存を持つ既存Compose由来コンテナでも同スクリプトを実行できる。依存導入や外部通信、原稿コードの実行はしない。型/Lint/必要CIの記録は最終PR本文へ同期する。

非対象は製品Workerへの型条件追加、実Runner/Validator接続、通常教材登録、実UI/保存の新単元通し、全量確定、React/Next.js/Python/任意Tailwind、公開。製品ソースが不変なので新しいBrowser/画像/全Visual/性能/Lighthouseはこの試作の完了証拠へ追加しない。既存Gateは公開前に必要で、未実行を成功扱いにしない。

リスクはこの固定原稿の観察を任意sourceの安全な採点と誤解すること、interfaceが配列範囲や実データを保証すると教えること。対策は適用範囲と制御例を明記し、製品化前に有限grammar/型条件/正負検査と実動作のAND、Worker応答の世代/時間上限/保存、独立レビューを別に確認する。Compiler/Runnerの上限やHome分離を変えず、新しい性能目標を承認済みとしない。

- [x] 受入条件と型習得/実行の証拠の限界を保持。
- [x] 非対象と現在の未登録状態を保持。
- [x] リスクと対策を制御例へ対応させた。
- [x] 固定Compiler/安全/保存/性能上限を変更しない。
- [ ] 最新HEAD独立Proレビューと必要CI。
- [ ] 製品のinterface採点、通常教材、初心者/実機/正式公開受入。

## 小教材原稿の技術確認（2026-10-02）

`typescript-question-interface-draft`へ4枚の作者原稿、演習説明/3段階Hint、Starter/Solutionを作成。型と値→必須項目→誤型の修正→型が保証しない配列範囲の順に進め、interfaceとstring[]を初出説明した。前の12制御例の高度な構文を、この初回原稿の既習条件へ加えていない。

掲載4コードとStarter/Solutionの計6sourceを、実Docker固定Compiler6.0.3の通常compileで照合した。形の例/範囲外例/Solutionはready、必須欠落は`main.ts:6:7 / TS2741`、誤型例とStarterは`main.ts:9:3 / TS2322`、型Error3sourceはJSを返さない。公開Hintの正答位置の1箇所修正だけで、Starter全文がSolution全文へ一致することも確認した。

型検査から独立した作者実行として、掲載6sourceのSHA256が前回の型診断時と一致することを確認し、型成功3sourceだけ同じCompilerで再emitしてDockerの実Node24.18.0で実行した。形の例は出力なし、範囲外例は標準出力`undefined`、Solutionは`内容`で、3件とも終了コード0。型Error3sourceと元の12制御原稿は実行していない。DOMを持たない固定作者sourceのNode実行だけで、製品Console/実Runner/保存/Reset/学習者の達成を確認済みとは言わない。12原稿の型関係観察は元入力とCompilerが前回から不変の範囲だけ保持する。製品/型採点/設定/Gateは未変更、最新HEAD独立レビューと必要CIはPR本文で別に追跡する。
