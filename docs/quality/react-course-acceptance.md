# React Courseの技術品質と初心者受入（Issue #123）

対象はTypeScriptを前提とするReact Course、15Lesson・標準12演習・Guided 2工程・独立Capstone 1課題。Next.js、任意npm、認証や外部サービスを含めない。Course/内容レビュー台帳はdraftを維持する。技術試験、独立内容レビュー、人による初心者観察、正式公開を別の証拠として扱う。

## 概念と教材の対応

| 親 #12 の概念               | 最初に扱うLesson         | 制作での対応                                            |
| --------------------------- | ------------------------ | ------------------------------------------------------- |
| Component・JSX・Props       | ch01-l01                 | ch02-l01 / ch03-l01 の型付きQuestionCard                |
| Componentの再利用           | ch01-l02                 | 問題データを変えて同じCardを使う                        |
| Composition                 | ch01-l03                 | 小さい表示責務と親の状態管理を分ける                    |
| Event・State                | ch01-l04                 | Callbackと親のState更新                                 |
| List・Key・immutable update | ch01-l05                 | 固有の選択肢Key・純粋なquizState更新                    |
| Form                        | ch01-l06                 | 読み取り専用足場の制御された名前入力                    |
| State配置・lifting state up | ch01-l07                 | 親からProps/Callbackを渡す                              |
| Reducer                     | ch01-l08                 | 状態遷移を整理する教材。ProjectへHookの使用を強制しない |
| Context                     | ch01-l09                 | Provider範囲を扱う教材。小さいクイズには追加しない      |
| Ref                         | ch01-l10                 | 入力focusの教材。表示はStateから導く                    |
| Effect・cleanup             | ch01-l11                 | 外部購読の切替・解除。導出文字数にはEffectを使わない    |
| Custom Hook                 | ch01-l12                 | 処理再利用とinstanceごとのState独立性                   |
| Guided / Capstone           | ch02-l01〜l02 / ch03-l01 | 共有工程の引継ぎと独立Briefへの応用                     |

`scripts/content/reportConceptCoverage.ts content/react` で全Conceptの初出・前提・習得Metadataを確認する。対応表はすべての概念をCapstoneで使用させる条件ではない。HookやAPIを列挙して使わせず、外部同期のないクイズにEffect/cleanupを要求しない。

## 追加技術検証

通常の変更関連テストと公開受入の追加検証を分ける。次のコマンドは固定済み依存とBrowserを持つ専用Docker内で実行する。

```sh
npm exec -- tsx scripts/content/reportConceptCoverage.ts content/react
npm exec -- playwright test --config=tests/acceptance/react.config.ts
```

`react-course.spec.ts` はChromium/Firefox/WebKitそれぞれでRef以外の14教材のSolutionを実Workerで型検査し、本物のReact/React DOM、全Interaction Scenario、同SourceのValidatorを通す。診断なし・すべてのRule合格を要求し、実結果をJSONへ保存する。全負例や固定足場・Source不一致・型/描画失敗・復帰は各教材の既存Fixture/通常UI試験も参照する。Refは、未操作の最小iframeハーネスではWebKitのfocus Snapshotがfalseとなったため、`react-ref-focus.spec.ts` で3Browserの学習者UIを確認する。実クリックで入力へフォーカスし、通常UIの全Scenario・型/Source条件とDOM条件の採点が、診断なし・全Rule合格で成功することを要求する。対象入力へ試験から直接focusして代用しない。Browserの成功だけを教材の説明能力や人の理解の証明にしない。

`react-reading.spec.ts` は追加した25コード・概念図をPCと390pxで読み、画像読込、axe、横にはみ出さないこと、本文末尾とPagerへの到達を確認する。Conceptの初回記述前にコードと図を読む条件は、検査を弱めず教材で満たす。図はオリジナルSVG、出典と代替テキストを登録する。

`react-progress.spec.ts` は合格したGuidedと型失敗したCapstoneを通常UIから書き出し、新しいBrowser Contextへ読み込む。Source、合格Snapshot、判定履歴、Lesson進捗を比較し、保存された型失敗を修正して実画面へ復帰する。

`react-performance.spec.ts` はCPU 4倍低速化、RTT 150ms、下り1.6Mbps・上り750kbpsでProps・Effect・Capstoneを観察する。PropsのStarterは型修正が課題なので、初回型診断までとSolution修正後に明示した初回プレビュー操作の完了までを分ける。暖機1回後の実プレビューと採点各5回の値・nearest-rank p95を記録し、標準演習では結果Drawerを閉じ、合格後に完成画面へ移るCapstoneでは保存済みSolutionの演習を開き直してから次の操作を行う。追加の合否予算は未承認であり、観察値として残す。

React/compiler/TSX EditorのHome/Path/Slide初期chunk非混入、authoring専用データ非配信、subpath、静的Artifact、既存のbundle必須予算を維持する。Home初期JSの基準版からの増分は注意目安20,480 gzip bytesを既に超過しているため、増分と全体値を記録して受入判断へ残す。性能観察では環境・初回/暖機・試行数・p95・低速化条件を記録し、Desktop Dockerの値を物理低速端末の保証にしない。未測定値や未承認の追加予算を合格と書かない。

## 人による観察票（未実施）

既存の本人承認済み手順・実記録があれば再利用する。まだない場合の候補は、TypeScriptのinterface・関数・readonly配列を読めるReact未経験者に、Props、State/List、Effect/cleanup、Guidedから独立Capstoneの順で「表示の予測→小さい修正→理由の説明」を試してもらう方法。人数・範囲・評価基準は本人確認後に確定する。全15Lessonを通読した証拠へ拡張しない。

| 記録するもの | 観察内容                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| 前提と環境   | React経験、TS前提、実Browser/端末、教材revision、実施日、同意済み範囲    |
| 予測と説明   | 本人の言葉、Props/State/Key/cleanupの理由、誤答の累積得点の予測          |
| 操作         | 自力/Hint/助言の区別、所要時間、Keyboard・保存・再読込・型失敗からの復帰 |
| つまずき     | 未説明語・難度飛躍・誤判定・復帰不能を具体的なLessonと操作へ結びつける   |
| 対応         | 必須問題の修正と再確認、残る制約、初心者受入の本人判断                   |

AI模擬操作、Browserエミュレーション、作者のSolution投入は実人試用ではない。物理端末で確認していない項目も明記する。氏名や不要な個人情報を公開台帳へ保存しない。

## 正式公開の残条件

人の受入記録、追加性能判断、独立レビュー、必要CI、React用の既存公開Gateへの明示的な接続、対象と復旧方法を示した本人の公開許可が揃うまで、`publicationStatus` とPathを変更しない。現在のRelease Course契約はReactを登録していないため、TypeScript/JavaScriptの承認を流用しない。

公開の際は検証済みsource/tree/dist、exact SHA/Run、配信後のProps/State/Effect/Projectと保存/再試行を記録する。問題があれば直前の承認済み公開へ戻し、保存済みSourceの扱いを確認する。#123と親 #12 は全条件が揃うまでOpenとする。
