# 予測・修正・応用のパイロット

Issue #23。既存ガイドを入口として残し、ClosureとHTML/CSS導入だけに考える場面を追加する。同じPro Chatのmain96054f1に対する設計助言を確認して実装する。

| ID      | 区分     | 受入条件                                                                                                                                            |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | 維持     | e01・既存ID/下書き/初回完了日時/必須完了条件を保持                                                                                                  |
| REQ-002 | 追加     | 問いを先に表示し、答えと理由はdetailsで開く。別問題へ開閉を持ち越さず、採点/保存を更新しない                                                        |
| REQ-003 | 追加     | Closure e02で初期化の場所を修正、e03で増分の違う2つの係を独立に使う。各workspaceを分離し任意の追加練習と表示                                        |
| REQ-004 | 維持     | 既存SourceFactとConsoleで正解2種と代表誤解/単純な出力置換を区別。任意evalやhidden probe基盤は追加しない                                             |
| REQ-005 | 追加     | Localの要求検証/能力応答/画面を有限3IDへ揃え、同じconsole/core profileで実Node実行。対象外/旧controllerは未対応案内、黙ったfallbackや不正解保存なし |
| REQ-006 | 維持     | ヒント/解答/不正解/Reset/追加課題往復/Import/Exportで既存e01下書きと完了を守る                                                                      |
| REQ-007 | 代替観察 | 承認済みの独立computer useで別例の説明と修正を観察し、できなかった点も記録。下記2026-10-18の結果と統合検証を合わせて受入判断する                    |

REQ-001〜006の技術要件は維持する。REQ-007の観察方法は後続の本人承認を受け、[現行runbookの代替受入](novice-observation-runbook.md#承認済みの独立computer-useによる代替受入)を適用する。実人の観察や学習効果を自動テストで代替したとは扱わない。観察待ちは#22など独立作業を止める理由にしない。

既存の生成り/深緑/黄色を用い、予測は「考えてみよう」、展開は「答えと理由を見る」とする。コード/例は既存Blockを再利用。閲覧・ガイド合格・追加練習合格を習得率として扱わない。

## 制約

採点は代表的な誤解と単純な固定出力置換を見分ける学習用の検査であり、ダミー呼出し等で故意に欺くコード全てを防ぐ試験基盤ではない。学習目標にない関数形式/return個数は固定しない。

旧Node演習と同じイメージ、資源上限、ファイル形式、停止/回収/隔離を維持する。PagesからLocal APIを探索せず、Homeの既存容量/遅延ロード条件も維持する。

## 検証範囲

予測の許可記法・回答非表示/別問題へのリセット、2演習の代表解/誤答、Browser/Local実行と採点、既存完了/下書きとImport/Export、PC/390pxを中心に確認する。実行した結果だけを追記する。全Course×全Browserや固定テスト件数を目標にしない。

以下の実行記録はPR #38当時の技術検証であり、その時点では初心者観察、実機タッチ、公開Gateは未実施だった。今回の独立操作とは分けて保持する。

## 実行記録

- 実Browser JavaScript RunnerでClosure e01/e02/e03のSolution/Starterと定義済みFixtureを確認。追加課題は `+=` と `= score + ...` / arrow関数の別解、毎回初期化・共有global・固定return・出力だけ・元関数を残した定数出力・構文誤りを区別した。
- 実Local web→controller→隔離Nodeで3演習のStarter不合格、Solution合格、追加2演習の別解合格を確認。pageerror 0。Nodeイメージ/隔離/権限/上限は変更していない。能力一覧欠落・対象外を未対応とする契約はHTTPモックを用いたService検証であり、実Node結果と区別する。
- Browserでe01を実合格させたBundleの教材revisionだけ旧版へ戻し、正規checksumを付けた合成BundleをImport。予測開閉、e02不正解・Hint・編集・Reset、同じURLの再表示、e02/e03実合格、Export→別profileへのImportまで完走。既存e01のfiles・currentComplete・firstCompletedAtを保持。過去ユーザーの実データによる確認ではない。
- この往復で同一URLの再検証時に新Controllerが旧Sessionのreadyを引き継ぐ不具合を発見。新Controllerのinitialize完了まで編集画面を待機させ、Runnerへ新しいiframeを渡す。`stop`/`dispose`やsandbox属性は変えず、同じ実フローの赤→緑を確認。既存画面/Session回帰82件・型・対象Lint成功。
- 1280×844 / 390×844のHTML/CSS予測とClosure予測で、初期閉→展開→理由末尾到達、横はみ出しなしを確認。Closure最終Slideの任意リンクと予測への再訪（再び閉）を確認。画像6枚を目視した。既存Closure最終SlideのVisual 2件は変更なしで成功し、基準画像は更新していない。

画像は[PC予測](evidence/issue-23/javascript-1280-prediction.png)、[390px予測](evidence/issue-23/javascript-390-prediction.png)、[PC任意リンク](evidence/issue-23/closure-1280-optional.png)、[390px任意リンク](evidence/issue-23/closure-390-optional.png)、[HTML/CSS PC](evidence/issue-23/html-css-1280-prediction.png)、[HTML/CSS 390px](evidence/issue-23/html-css-390-prediction.png)。Local buildの読書画面であり、公開Pagesで新機能を検証した画像ではない。

## PR #38当時の未完条件と復帰条件

当時は、実初心者に予測を説明してもらい、小修正・別増分での独立性を観察する受入条件が未実施だった。実装PRの統合だけではIssue #23をcloseせず、その後承認された観察方法で対象教材版を固定し再評価する。合成Bundle・自動操作を学習効果の実証として扱わない。

最終の関連検証はDocker Composeで `npm run lint`、`npm run test:changed`（84ファイル826件）、production build、CSS inline、learning chunk isolation、配信容量9件が成功。教材集計の旧27演習/420分と旧practice専用検査は、29演習/430分とpredictionを許可する契約へ同期した。上限・セキュリティ期待・snapshotを緩和していない。

Production buildのChromiumでは対象JS Fixture、保存往復、既存HTML/CSS全消去Reset、初回自動Previewの4件が成功。最初の同時指定で対象JS用Fixture filterをHTML/CSSの全Fixtureテストにも渡した1件は一致0で失敗しており、HTML/CSS全Fixtureを検証済みとはしない。追加2演習を含むJS対象の全定義済みFixtureは実行済み。

### 同じURLへ直ちに戻る場合の追加回帰

独立レビュー待ちに、編集直後（debounce保存前）の同一URL再検証で、新Sessionが旧Sessionの保存完了より先に古いDraftを読む問題を実Local画面で再現した。同じDocumentであることも確認。新Sessionの初期化は直前までの初期化と旧Controllerのflushを待つようにした。2回連続の即再表示と従来の保存往復の実Browser E2E 2件、画面/Hook 39件・型・Lintが成功。静止画や教材/採点条件は変えていない。全ページを閉じる操作の同期保存保証を追加したものではない。

### 追加練習の説明表示

構造化された手順があると指示本文を表示しない既存分岐に対し、任意練習だけ説明とルールを開閉可能な欄で表示した。e03はstepの意味と残す名前/呼び出しを説明し、完成した更新行自体は後段ヒントに残す。段落Rendererがコード記法を解釈しないため、この2指示文の不要なバッククォートも除いた。採点条件/必須e01は変更しない。

Docker Chromiumの追加回帰2件（即時同URL再表示、従来保存往復＋説明の可視性/答え先出しなし）成功。1280×800でe02/e03の説明先頭と手順末尾へ到達し、Document横あふれなし。4枚を目視し、説明/エディタ/実行操作の重なりがないことを確認した（[e02先頭](evidence/issue-23/closure-e02-instructions-start.png)・[末尾](evidence/issue-23/closure-e02-instructions-end.png)、[e03先頭](evidence/issue-23/closure-e03-instructions-start.png)・[末尾](evidence/issue-23/closure-e03-instructions-end.png)）。実端末/初心者観察の代替ではない。

## 独立レビューと最終差分

同じProが初回92b73f04864805216fa115739e466b70e5ae6044で2Lesson全8Slide/演習を承認し、追加b5b91efeaf84bc7977a5d29ee479f85cce4e465bで保存順/説明表示を限定レビューしてLGTM。accuracy・goalExerciseAlignment・decisionはapproved、unexplainedTerms/hintLeakageは0。原本tree/hashはProも独立再計算し、初回6＋追加4画像を目視。Dockerの実行証拠とは区別する。マージ前には台帳更新後のCIと記録差分を確認する。

追加修正HEADでLint・型/build/CSSinline/chunk/容量9が成功。正しいTEST_BASE_SHAで前回承認HEADとの差分を指定した関連49ファイル493件、production Chromiumの保存/追加説明2E2Eも成功。最初のtest:changedは環境変数指定を誤って対象0件だったため、回帰成功の件数には含めない。初心者観察/物理端末/新HEADの公開Gateは未実施のまま。

## 2026-10-18：独立computer useによる観察

現行runbookで#23にも適用が承認された代替方式を用いた。実人0名、互いに履歴を共有しない独立担当2名であり、実装担当・3名のコードレビュー担当とも別である。HTML/CSS初学者役と、変数・Function呼び出しを知るがClosureは初めての役が、Macの既存Chromeを順次操作した。教材以外のrepo・想定解・他担当の結果を渡さず、予測を先に記録してから通常UIで学習・編集・判定した。人間の理解・習得率・所要時間の測定ではない。

### 候補と証拠の対応

観察ArtifactのSourceは`af211f471fa5ac67ffda5a153e79d06b024d94ae`、treeは`6c73bb407d9448ed3cfd38ea3ced15ece99786a9`。固定distのSHA-256は`caa86066f40c0750ca014de213a7dd2580511e34b6bb8a2b790907468f0d45ee`（583 file）で、相対path順にpath・NUL・各fileのSHA-256・改行を連結して算出した。選定時main `8717246da6d7338f2525305572effa4f3ccea33c`までの差分は`novice-observation.md`だけであり、製品・対象教材は同じ。元Sourceを最新mainへ付け替えず、既存Artifactを再利用した。

| 担当    | 操作origin              | 対象Lesson            | 配信Lesson JSONのSHA-256                                           |
| ------- | ----------------------- | --------------------- | ------------------------------------------------------------------ |
| HTML    | `http://127.0.0.1:5220` | `html-css-ch00-l01`   | `59bfe57d85684d508bba5aa671f08062ff980a6de4e16c533b017e2a82f75f2e` |
| Closure | `http://127.0.0.1:5221` | `javascript-ch03-l05` | `3c5e2f60b1240c642c59b18827f7712f40334930576ec405652105a5ad29a143` |

両originのindex SHA-256は`569ebd75ab4367c024d72c7cbcd80bafa43abc4a3d2541da202dcd2227c0a6e8`。readonly distを配信するDocker previewでHTTP 200と各byteの一致を確認した。既存origin、作品、進捗、設定は変更していない。

本人原文・担当参照・原画像を非公開の原本manifestへ結合した。HTMLはthread `01a14d34-5605-71ab-b712-5c848359b021`／turn `01a14d34-632e-71ba-a481-8fda2fa5e0d5`、manifest SHA-256 `91e84ea323127d3f13dc0d6b4e2024980fb0e43a8d16aed2736d397540b3e33a`。Closureはthread `01a14d36-b6a2-71db-bd57-9412eb4100e7`／turn `01a14d36-c280-74fe-93ab-61a367e10b5c`、manifest SHA-256 `902504cbdc78d0b6b8aaa5a12ee7ee8711da339197eb70b86709fa4756c63031`。原文や作業ログ自体は公開pushへ含めない。

### HTML：予測と指示編集

4 Slideの3枚目で、答えを開く前に「見出しの言葉だけを変えても背景色は変わらない。言葉はHTML、背景はCSS」と予測・理由を記録し、開示後の「生成り色のまま」と照合した。本人はBrowserが両fileを読み、見出しを`index.html`、背景を`styles.css`で変える役割も説明した。

演習では可視の手順に指定された通り、見出しを「わたしの学習ノート」、背景を`#fffaf0`へ変更し、Previewと通常判定・完了を確認した。Hint・用語集・Solutionは使わず、予測の答えは記録後に開いた。誤答や判定失敗は報告されていない。「説明を見直す」から戻り、reload後もHTML/CSSと「判定結果を見る」が保持されたとの原文がある。

原画像自体では変更済みCSS、見出し、生成り色のPreviewと「判定結果を見る」を確認した。静止画だけで予測の前後関係・判定・reloadを証明したとはせず、時系列は本人原文へ対応させる。これは指示された2箇所の編集であり、独自の別ページ制作・別例への応用は未記録である。その未記録範囲をClosureの別例と混同しない。

### Closure：初期化修正と別増分の説明

| 場面            | 答え・実行前の予測 | 本人の理由                             | 確認の範囲                                            |
| --------------- | ------------------ | -------------------------------------- | ----------------------------------------------------- |
| Slide 3         | a=30、b=20         | aは20、bは10を別々に保持し、10加算する | 予測後に答えと理由を開き一致                          |
| 増分5           | 5、10              | 同じscoreへ5を2回加算する              | 本人が実行後の一致を報告                              |
| e02の初期化修正 | 10、20、30         | 初期化を外側に置き、毎回リセットしない | 修正コードと追加練習1の合格画像を照合                 |
| e03の増分2・5   | 2、5、4、10、6     | 係ごとのscoreとstepを保持する          | 修正コードと追加練習2の合格画像を照合                 |
| 別例の増分3・7  | 3、7、6、14、9     | 同じ仕組みで独立して加算する           | 3・7の呼び出しとConsole 5行が同時に見える原画像を照合 |

通常e01の0→10は教材に明示された変更である。追加e02ではStarterの内側にあった`let score = 0`を外側へ移し、e03では`score += 10`を`score += step`へ変更した。教材は初期化位置、stepの意味、期待する出力を案内している。e02/e03の表の数値も既に指示へ表示されており、無支援の独立予測や白紙実装能力は主張しない。その上で別増分3・7の出力と独立性を本人が説明し、Consoleでも確認した。指定2・5での判定成功と、3・7での別例実行を分ける。原文の2・5のコードと画像の3・7のコードは別snapshotであり、その後2・5へ戻したか、3・7で自動判定に合格したか、その状態で完了を保持したかは未確認である。

支援はSlideの完成例・説明、予測記録後の「答えと理由を見る」、通常演習修正後の「説明を見直す」。Hintボタンは未使用だった。完成例と初期Consoleに結果が同時表示される場面は、独立した予測へ数えない。3演習とも初回判定で合格したと報告され、画像自体で通常演習の1/1完了と追加2件それぞれの完了・端末進捗保存を確認した。実際の誤答・Hint前後の比較は未観察であり、意図的な失敗を実施済みにはしない。

通常演習のコードはreload後も保持され、追加練習2の完了画面もreload後に保持されたとの原文がある。対象3件の開始時は初期コードでResetが無効だったが、開始前のコース全体の完了履歴は未確認だった。既存進捗をResetしていないことと、全保存データをbyte比較したことは別である。両担当とも既存タブを変更せず、操作終了時に新しい`about:blank`を前面にしたと報告した。

### 所見・受入範囲・検証

HTMLではPreviewが32%表示で細かな比較をしづらいとの所見があった。原画像に拡大controlは見えるが、それを操作したとは扱わない。Closureでは編集直後に前回のConsoleが残り、更新後の出力を確認したとの所見がある。どちらも本人が課題を完了しており、今回の観察に進行不能・誤判定は報告されていない。改善候補として保持し、原因未確認の製品変更や追加の課題は加えない。

REQ-001〜006は上記PR #38の実装・技術検証を継承し、今回の担当が全誤答・Reset・Import/Export・Local Nodeを再検証したとは記録しない。REQ-007は承認済み代替方式で、予測、説明、初期化の修正、別増分への適用、できなかった点と支援・限界を記録した。#107のProfile/Capstoneや#106のCheckpoint観察を、この2担当の操作へ付け替えていない。

今回の変更は受入文書だけで、製品・教材・採点・保存の動作変更がないため動作TDDは適用しない。原文・画像・現教材・Issue要件の3名独立照合、対象Markdownの整形と差分検査、最終HEADおよびmerge後mainの設定済みCIを統合条件とする。旧検証のSourceを付け替えず、文書変更のために同じ全テストやbuildを繰り返さない。Issue closeは統合確認後に行う。正式公開、#137、親#7の保留と`releaseStatus: draft`は維持する。
