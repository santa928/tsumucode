# React Courseの技術品質と初心者受入（Issue #123）

対象はTypeScriptを前提とするReact Course、15Lesson・標準12演習・Guided 2工程・独立Capstone 1課題。Next.js、任意npm、認証や外部サービスを含めない。2026-10-07に本人が独立3personaの模擬受入・低速エミュレーション・Gate後の正式公開とTypeScript直後のPath追加を承認した。技術試験、模擬初心者受入、独立内容レビュー、正式公開をそれぞれ記録する。実人試用・物理実機は未確認。

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

`react-performance.spec.ts` はCPU 4倍低速化、RTT 150ms、下り1.6Mbps・上り750kbpsでProps・Effect・Capstoneを観察する。HTTPキャッシュを無効化し、初回は新規Context/IndexedDBで20回、操作は同じContextで暖機1回後に各20回を測定する。初回はnavigationからStarterの型診断または描画まで、操作は実Controllerの完了Measureまで。PropsのStarter型失敗を描画成功へ読み替えない。標準演習では結果Drawerを閉じ、完成画面へ移るCapstoneでは保存した同じ演習を開き直す。取得時のSource・Artifact・アプリ・依存・課題・harness hash、全数値・失敗・timeoutを残す。nearest-rank p95を再計算し、初回最大10秒、Preview p95 2秒、採点p95 10秒を最初の合否予算とする。困難な場合だけ、原因・UX影響・変更前後値・実測を示した必要最小限の緩和を本人が許可している。測定前に緩和しない。
React/compiler/TSX EditorのHome/Path/Slide初期chunk非混入、authoring専用データ非配信、subpath、静的Artifact、既存のbundle必須予算を維持する。Home初期JSの基準版からの増分は注意目安20,480 gzip bytesを既に超過しているため、増分と全体値を記録して受入判断へ残す。性能観察では環境・初回/暖機・試行数・p95・低速化条件を記録し、Desktop Dockerの値を物理低速端末の保証にしない。未測定値や未承認の追加予算を合格と書かない。

## 承認済み模擬初心者受入

TypeScript前提を持つReact未経験者の3役を、解答や作者ソースを渡さない別agent・Browser Contextで模擬する。全15Lessonの全SlideをUIで読み、予測→修正→実判定→理由説明を記録する。Aは丁寧な初学者、Bは誤解や疑問を言語化する初学者、Cは型診断とKeyboardを頼りにする初学者。Guidedから独立Capstoneへの責務説明、自力/段階Hint、つまずき・失敗復帰を残す。

このセッションにはComputer Useの公開toolがないため、Docker PlaywrightのUIブリッジを使う。学習者は描画された画面のariaSnapshot・実Preview表示・画像を読み、通常のリンク/ボタン/タブ/コードエディターを操作する。教材JSON・解答・Fixture・IndexedDBへアクセスする操作は提供しない。これもAI模擬であり、実人の読解や物理端末を保証しない。privateの原文・画面・操作ログは公開pushへ含めず、独立確認者が照合する。公開記録は限定したSource/hash/件数/観測数値と原本照合宣言を保持する。

## 正式公開の残条件

3役の全45組、20標本の性能、独立レビュー、必要CI、React専用公開Gateの照合を完了する。正式公開許可は親thread `01a10b91-1aa7-7475-a007-c3fb4bce8017` の2026-10-07T09:32:00.222350Z本人返信に基づく。公開差分はReactのpublishedと既存frontendへのrequired/[typescript]の末尾Stepのみ。別Courseの承認を流用しない。公開前後の学習入力manifestはこの2箇所だけを正規化し、教材・採点・依存・UI・harnessの差し替えを拒否する。

公開の際は検証済みsource/tree/dist、exact SHA/Run、全site品質CI、配信後のProps/State/Effect/Project・開始/再開/採点/保存/Export/fresh Importを記録する。問題があれば直前の承認済み公開へ戻し、保存済みSourceの扱いを確認する。#123と親 #12 は全条件が揃うまでOpenとする。

## 最終入力の観測と制約

CIで見つかったUnit/Browser収集の混在を修正し、安全停止後のSource・成功履歴保持と正常再採点への復帰を回帰で確認した。Gateの入力scope・履歴条件は維持し、修正後のdraft Source `fde8d31fdb39fe64d853614706e5cd85cf5a5022` でBrowser45件、3代表の各20初回・20Preview・20採点、PC/390pxの読書と実Export/Importを再取得した。Browser45件はretry0・全判定成功。性能は全代表でfailure0、従来予算内だった。

| 代表     | 初回最大 | Preview p95 | 採点 p95 |
| -------- | -------: | ----------: | -------: |
| Props    |   8400ms |    1677.9ms | 3009.3ms |
| Effect   |   6996ms |    1711.9ms | 6641.9ms |
| Capstone |   7036ms |    1759.6ms | 8545.8ms |

以前のSourceでEffectの暖機測定中に `javascript-budget` が発生した。初回20件・操作16組後の未完原本と、同条件の非正式診断24組48操作で再現しなかった原本を保存した。失敗当時の超過時間・checkpoint数・depthがなく、原因は未確定である。module読み込み待機や遅延更新を含む可能性はあるが、今回の成功を原因解消の証明へ広げない。閾値・実行予算・有限文法は変更していない。

実Compiler後のテスト用portにだけ有限負荷を注入する技術確認では、実Analyzer/Runner/opaque Bridgeの `javascript-budget`・system診断と予算超過を観測し、同じRunnerの新revisionで正常描画・Snapshotへ復帰した。この故障注入は旧失敗原因の再現や性能合格とは別範囲である。保存保護はController回帰で停止中のSource・既存履歴・passing snapshot保持と復帰後の合格1件を確認した。

3役のAI模擬受入は全15教材の可視入力hashが同一で、既存Gateが認める条件で原本を再利用する。実人・物理実機は未確認のままである。Guided/Capstoneの説明にある内部実装語は任意改善の観測として引き継ぐ。正式CI、承認Sourceの祖先条件、実公開と配信後主要操作は公開承認・release台帳・post-deploy記録に対応付ける。
