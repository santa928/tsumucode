# Issue #261 React初回の用語と制作案内

PR #433の工程票修正後、main `9055cd07b985f11ffb9bf6a8d20666edf4941a0d` を基点に残った初出順と入口の表記を限定改訂する。#260の未確定到達点を追加しない。

## 変更と理由

- s01: 「Componentは表示を返す関数」から「表示を返す関数（Component）」へ。本文も意味を先にし、「ここでは」と関数の教材範囲を限定する。Reactの他のComponent形式を否定しない。
- s02: 「JSXで値を表示する」から「表示を書く構文（JSX）」へ。本文のJSX/TSXも意味→正式名の順にし、HTML文字列ではない説明は保持する。
- s03: 「Propsでデータを渡す」から「部品へ渡す値（Props）」へ。本文でも呼び出し元から渡す値を先に説明する。型と実表示を分ける説明は不変。
- Course入口: Props/State/Ref/Effect/Custom Hookの日本語の意味を前置する。旧Guided/Capstone/Brief表記を、既存の「手順付き制作2工程」と「別の仕様に沿う制作」で説明する。制作段階の案内は、後者の下書きを別に保存する意味を明示し、自力設計能力を保証しない。

新しい万能文言Lintは作らない。既存 `react-first-step.test.ts` に対象3 Slideと入口だけの回帰条件を追加する。用語の正式名、掲載コード、課題条件、Hint、Fixture、ID/URL、保存契約は保持する。

## 独立レビューと不変確認

作者は `issue261-react-terms-author`、独立レビュアーは `review_issue261_clarity`。レビュアーは3 Slideと入口、既存Ref/Effect/Custom Hook教材と制作区分を静的に照合し、正確性・目標整合を承認した。新たな未説明語、意図しないHint漏洩、必須修正は各0。

Lesson内21ファイル中18ファイルは基点と同byte。変更3 Slideの全掲載コードも同byte。Course YAMLは2つのdescription以外同値。教材の実行条件・保存条件を変えていない。

- 旧Lesson全文SHA-256: `a771cb4c71fec39641b87ce651f54f458c355cbc8d2a78b2054b74908e22447b`
- 新Lesson全文SHA-256: `09a296e8062f3ab30ff6458e98b74ecf292523d27e01e9a90f1472b6c3191d47`
- 算出方法: 既存 `verifyContentReview.ts` と同じ相対path昇順の `path + NUL + bytes`。レビュアーも独立再計算し一致。

台帳の旧原承認文・公開bindingは保持し、初回Lessonの新しい静的内容承認を追記する。`examplesExecuted` はコード不変範囲で旧実行記録を限定再利用したもので、新しい実行、未閲覧の旧生ログの再照合、初心者の理解の実証ではない。

## 未確認と次工程

`git diff --check` とSourceのbyte/掲載コード比較は成功。YAML読解とSource上の文字数見積もりも実施したが、正式Compiler・型・Lint・追加テストは未実行。クラウドにDockerがないためホストNode/npmでは代替しない。PR #433のCI成功を、この後続変更の成功とは扱わない。

PC/狭幅の表示・読み順、独立UI3役は未確認。先の候補UIへのブラウザ接続はERR_CONNECTION_REFUSEDだったため、別経路で迂回せず観察を保留する。実行可能な正規環境で最終文言を固定してから変更面を観察し、必要な4役の実承認原本を独立照合する。現段階でcontent-v2 receiptは追加しない。

全コース本文、日本語先行の全件適合、実人の理解、Issue #261全体の完了、正式公開の承認には広げない。

## 変更面のBrowser検査を補う設計

初回head `dbaecf7567ef1145729758f45900fb1c904082e1` のPR CI run `44024244699` は成功した。premergeは178 files/2,098 tests、fastは404 files/4,699 tests、Lint 1,134 files、型・build・台帳も成功。ただし既存pr_visualはHTML/CSSの共通6画面とPython/Next入口であり、今回のReact文言の表示を検査していなかった。READMEのマージ前「変更面のBrowser確認」を未充足として、統合を保留した。

追加は新たな環境への迂回ではなく、既存pr_visualの同一preview・同一Browser imageを使う規定テスト2件（1280×720、390×844）に限定する。別workflowの作成や既存workflowの権限変更はせず、`scripts/ci/prVisual.ts` の厳密な収集・実行照合を既存6件＋React2件へ拡張する。対象はHome/Course MapのReact説明、Course Map/Libraryの制作段階説明、初回3 Slideの見出しと初出段落。スクロール到達、文末までの非切断、本文とページ全体の横はみ出し、見出しから本文の配置と意味→正式名の順を確認し、既存の診断artifact内へ変更面の画像を保存する。

代替の全React Runtime suiteや専用workflowは対象外の実行とCI重複を増やすため採らない。新しいBrowser build、アプリ再build、依存、権限、Worker故障操作、個人データ、receipt生成は追加しない。1 worker・retry 0・既存20分上限を維持する。追加コストは2件の検査と14枚の限定画像で、検査は数秒〜数十秒を想定するが実測前。head更新に伴う既存PR CI一式の再検証は必要であり、旧runの成功を新headへ転用しない。

設計と実装差分は `review_issue261_clarity` が独立確認し、静的範囲で承認した（必須修正0）。CI実行・画像確認は別途行う。実行前のred/greenはDocker不在で未実施。否定入力（既存/新規case欠落、重複、余計な選択、skip、retry、別project）の拒否を既存CLI fixtureで検証する。この表示回帰検査は独立UI3役や理解の観察、#433の工程票操作、content-v2 receiptを代用しない。
