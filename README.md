# TsumuCode

TsumuCodeは、スライドで仕組みを理解し、ブラウザ上でコードを書き、プレビューと自動判定で確かめる個人・身内向けの非商用フロントエンド学習サイトです。ログインなしで静的な解説とBrowser演習をGitHub Pagesで利用できます。実Node/Nextサーバーを使う演習はローカルDockerの学習環境で実行します。

初回公開版は、完全初心者向けのHTML/CSSコースです。

- 14章、51レッスン、104スライド、45標準演習、学習時間の目安710分
- 5工程でプロフィールページを組み立てるGuided Project
- Briefから個人制作展サイトを完成させるCapstone Project
- スライドの前後移動と一覧、演習中の関連スライド見直し、段階ヒント
- 進捗と下書きへ触れず、全104スライドを自由に読めるスライド閲覧モード
- HTML/CSS編集、隔離プレビュー、構造・見た目・アクセシビリティの自動判定
- 端末内の進捗・下書き保存、JSONでの書き出しと差分確認付き読み込み
- 独立したコースをおすすめ順に並べる学習パス

## 対象者と対応環境

HTMLやCSSを初めて学ぶ人を対象にしています。スライドと進捗確認はスマートフォン、タブレット、PCで利用できます。

コード演習は、幅1024 CSS px以上かつマウスまたはトラックパッドを使えるPC向けです。小画面や編集条件を満たさない端末ではEditorとRunnerを読み込まず、スライド学習、進捗確認、完了済みコードの安全なPreview、PCへ渡す演習URLと学習データの書き出しを提供します。

Preview内を操作した後、編集権の再確認が必要な場合は、Preview更新・判定を「編集権を確認しています」と表示して待機し、確認後に実行します。別のタブへ編集権が移った場合は実行しません。

主要FlowはChromium、Firefox、WebKitで検証します。JavaScriptが無効な環境と古いブラウザは対象外です。

## 必要なもの

- Docker Desktop
- ローカルNode.js学習はDocker Server API v1.47対応が必要です（実測Engine 28.0.1）。旧APIとの自動交渉は行いません。
- Docker Compose v2
- GitHub Pagesへ公開する場合のみGitHub CLIまたはGitHubのWeb画面

Node.jsやnpmをHostへインストールする必要はありません。依存導入、開発サーバー、テスト、BuildはすべてDocker Compose内で実行します。

以降は必ず`./scripts/docker-compose.sh`を使います。このWrapperがmain checkoutとlinked worktreeを自動判定し、コンテナへ必要なGit metadataをread-onlyで渡します。

## Setupと開発サーバー

初回または依存更新後に、Dockerのnamed volumeへ固定済み依存を導入します。

```bash
./scripts/docker-compose.sh run --rm app npm ci
```

開発サーバーを起動します。

```bash
./scripts/docker-compose.sh up app
```

[http://localhost:5173/](http://localhost:5173/)を開きます。停止するときは、起動したTerminalで`Ctrl+C`を押します。

## 学習パスとコース

Homeの「今回の学習」には、初回は目安10分で見出しと背景色を変えるHTML導入、再訪時はこの端末のHTML/CSSの続きが表示されます。スマホなど演習を編集できない端末では「解説を読む」を優先します。続き位置の確認中・読込失敗時にも解説を読め、失敗時は再確認できます。

その下には、複数のコースをおすすめ順に並べる「学習パス」と自由に選べる教材棚を残しています。学習パスは順番を案内する設計図であり、各コースは独立して開始・完了できます。前のコースが未完了でもロックされず、学びたいコースから直接始められます。端末データのImport/Export・復旧操作もHome下部から利用できます。

現在公開している「フロントエンド学習パス」にはHTML/CSSコースだけを収録しています。JavaScript、TypeScript、Reactなどのコースは、教材と品質確認が完成してから順次このパスへ追加します。学習パスの直リンクは[`#/paths/frontend`](http://localhost:5173/#/paths/frontend)です。

JavaScriptは、安全な複数ファイル実行基盤とChapter 00〜13の52 Lesson／202 ConceptSlide／54 Exercise（Course完了必須52＋任意Closure2、推定1,010分）を`draft`として品質検証中です。既存46 Lesson／760分に、学習クイズのGuided制作5 Lesson／100分とCapstone制作1 Lesson／150分を加えています。1,010分は教材の推定所要時間の合計です。値・条件分岐・Function・Arrayから`map`・`filter`・`reduce`・immutable update、Module・Error・Debugと、DOMで要素を探して文字やclassを変え、新しい要素の接続と複数要素への操作を行う4単元、クリック処理の登録と実行、入力のたびに現在値を表示する操作と、Formの送信を止めて入力を使う操作と、空白を除いた入力を検証する操作、操作の間で値を保持するStateと、値から表示をそろえるrenderとArrayから一覧を作り、元のデータを残して絞り込む方法、同梱の問題データをPromiseとasync/awaitで受け取り表示し、失敗を知らせて再試行し、読み込み中の案内と操作可否をそろえる方法、標準ボタンとEscapeでヒントを操作し、開始・戻る操作に合わせてFocusを移し、操作名と開閉状態をそろえる方法を学べます。制作では問題表示・回答・得点・結果・再挑戦を積み上げ、Capstoneでカテゴリ選択・進捗・Keyboard操作も扱います。通常の公開学習パスにはまだ掲載せず、改訂済み単元をHomeの試用目次から利用できます。Homeの「制作途中のレッスンを試す」→試用目次の「一続きに読む：JavaScriptで画面の文字を変える」→Readerの演習リンク→演習の「← コース」で、全52 LessonのCourse Mapへ進めます。開発時は[最初のJavaScriptスライド](http://localhost:5173/#/courses/javascript/lessons/javascript-ch00-l01/slides/javascript-ch00-l01-s01)、[Chapter 06の最初のスライド](http://localhost:5173/#/courses/javascript/lessons/javascript-ch06-l01/slides/javascript-ch06-l01-s01)、[Debug演習](http://localhost:5173/#/courses/javascript/lessons/javascript-ch06-l04/exercises/javascript-ch06-l04-e01)の直接URLから確認できます。`draft`は非掲載を意味するだけで、Production Artifactへ含まれる教材を機密情報として扱うものではありません。

学習パスの進捗は、この端末に保存された各コースの進捗からその都度計算します。学習パス専用の進捗Recordは作らないため、既存の書き出し・読み込み形式や各コースの下書きはそのまま利用できます。

## スライドだけ見る

外出先などで読むだけの場合は、Home先頭の「解説を読む」（PCでは「解説だけ読む」）、または教材棚の「スライドだけ見る」から目次を開きます。

閲覧モードは通常学習の進捗、再開地点、下書きを参照・更新しません。「一続きに読む」でLesson全文を読み、従来の1枚表示とも往復できます。読書専用の続き位置と「あとで試す」の印だけをこの端末・このサイトに保存し、目次の「読書の続きから」で再開します。保存できなくても本文は読めます。目次と各スライドはHash URLを再読込・共有できます。通常学習へ戻ると、Course Map以降は通常の端末保存が再開します。

[試用レッスンの目次](http://localhost:5173/#/library/pilot)では、HTML導入・JavaScript導入・Closure・DOMの4単元・clickの最初の単元を通読・1枚表示で試せます。通常の公開LibraryやJavaScript Course全体の公開状態は変えません。読書位置のURLとPC向け演習URLは別々にコピーできます。端末間、Pagesとローカル学習版の間でコードや進捗は自動同期されません。学習データの移動には通常学習のJSON書き出し・読み込みを使います。読書の印はこのJSONには含めません。

GitHub Pagesへ公開した後のHTML/CSSコースの直リンクは、[スライド目次](https://santa928.github.io/tsumucode/#/library/html-css)です。

## 学習方法

1. 初回はHomeの「見出しと背景色を変えてみる」から解説を開きます。再訪時は「HTML/CSSの続きから」で再開します。
2. 別の教材を選ぶ場合は教材棚・学習パスからコースマップを開きます。
3. スライド一覧、前後ボタン、左右矢印キーで概念を学びます。
4. PCでは手順、Editor、Preview、判定操作を固定Workspace内で見比べながらHTML/CSSを編集します。Tab／Shift+Tabで字下げし、Editorを出るときはEscapeの後にTabまたはShift+Tabを押します。
5. 演習中は「説明を見直す」から同じレッスンの説明を選び、コードと判定履歴を保ったまま確認できます。不合格時は段階ヒントや判定結果からも関連スライドを見直せます。
6. 合格後は完了画面とコースマップで進捗を確認します。

最初のHTML/CSS演習の工程票には「HTML/CSSを持ち出す」があります。クリック時点の`index.html`、`styles.css`と開き方をZIPにし、展開した`index.html`をサイト外のブラウザで開けます。この演習にインストールや開発サーバーは不要です。進捗JSONの書き出しとは別で、学習履歴・採点・自動保存は付きません。ZIP内の編集はサイトの下書きへ戻りません。対象・環境差は[ソース持ち出しの記録](docs/quality/portable-html-source.md)を参照してください。

## 現在の実行環境

HTML/CSSとDOMを使うJavaScript演習は「ブラウザで実行」と表示し、既存の隔離Previewを利用します。Closureの3演習（`javascript-ch03-l05-e01`〜`e03`）は「ブラウザで実行（Console専用）」となり、編集時に`script.js`を隔離Workerで実行します。配列・オブジェクトの変数添字と、有限のPromise・microtask処理を利用できます。HTML/CSSファイルの下書きは保持しますが、この3演習では画面描画に使いません。DOM・タイマー・外部通信・Storage・moduleには対応していません。

実行できたことと教材の合格は別です。未対応・制限停止・環境障害を採点履歴へ保存しません。編集内容と前回の成功結果は保持します。DOM操作後の例外と未捕捉Promise拒否も、判定中の観測でコード診断へ反映します。遅延処理の予算・タイマー上限による停止は採点しません。Console実行は1500ms、100件・1件4KiB・合計64KiBの出力上限を設け、停止後は新しいWorkerで再試行します。DOM側の変数添字等の制約は残ります。dom / dom-form profileの`currentTarget`は同じDocumentのElementとdispatch後のnullに対応し、非Elementの取得は未対応として採点しません。Form用の`dom-form`はnative submitと学習者のpreventDefaultを操作ごとに観測します。通信・遷移は引き続き禁止し、Ch08-l03で取消と表示を確認します。詳細は[DOM実行の境界](docs/quality/browser-dom-runtime.md)を参照してください。実行方式と確認範囲は[Browser Console設計記録](docs/quality/browser-console-runtime.md)に記載しています。

ローカルDocker学習版では、Closureのガイド練習と任意の追加練習2件を実Node.jsで実行できます。Next.jsの未公開Local教材では、実page・限定GET/POST・Server Actionを確認できます。Pythonとターミナルは未実装です。Pagesや読書画面からlocalhostを探索しません。実行portと任意DOM portの境界・制限は[Issue #27の設計記録](docs/quality/runtime-execution-boundary.md)に記載しています。

## ローカルNode.js学習

Dockerを起動し、リポジトリ直下で次を実行します。初回は固定Node/Chromiumイメージの取得と学習画面のbuildを行います。ホストへのNode/npm導入は不要です。

```bash
./scripts/learn.sh
```

[http://127.0.0.1:4173/](http://127.0.0.1:4173/)を開き、「ClosureをNode.jsで実行する」を選びます。`localhost`ではなくこのURLを使ってください。最初のコードを「プレビューを更新」で実行すると0、0と出力します。`score += 0`を`score += 10`に直して再実行すると10、20になります。「判定する」で教材条件を確認します。実行中は「実行を停止」で中止できます。編集だけではNodeは起動せず、下書きは従来どおり自動保存します。

対象は`javascript-ch03-l05-e01`（ガイド）、`e02`（初期化の修正）、`e03`（別の増分を持つ2つの係）です。追加練習へはClosureの最終スライドか完了画面から進めます。追加練習をしなくても、ガイド練習によるLesson完了は保持します。古い学習用controllerで「未対応」と出た場合はコードを保存し、学習モードを再起動してください。他のHTML/CSS・JavaScript演習はBrowser実行を維持します。NodeにDOMはありません。終了コード0でも教材条件を満たさなければ合格にはなりません。停止・制限到達・接続障害は不正解履歴へ保存しません。

学習用webと信頼controllerは開発用appから分離しています。**controllerだけがDocker管理socketを持ち、これはホスト管理に相当する強い権限です。** 学習コードは別の使い捨てコンテナへ渡し、非root・read-only・ネットワークなし・host mountなしで実行します。同時1件、5秒、256 MiB、PID 64、出力64 KiBが上限です。第三者の敵対コードを安全に実行する公開サービスではありません。詳細とAPI仕様は[Local Node設計・検証記録](docs/quality/local-node-runtime.md)にあります。

学習一覧の「実サーバーで見出しを変更する」では、Local専用の固定Vite Projectを
編集→保存→起動→実HTTP Preview→変更反映→判定→停止/再開できます。
`message.js` の文字列を `こんにちは、実サーバー！` に変更し、可視の見出しへ表示します。
run専用hostの4175番にPreviewを分離し、保存版と反映版が一致した時だけ固定Browserで採点します。
端末の下書き/進捗とcontrollerのSource volumeは別の保存先です。
Pages/Local間の下書き/進捗は既存の端末データJSONで移行できます。管理tokenやrunは移行しません。
手順・保存/採点の境界は[Workspace学習の契約](docs/quality/local-workspace-learning.md)、Origin、Cookie、許可経路は
[Preview境界の契約](docs/quality/local-preview-boundary.md)にあります。

「Next.jsの最初のLessonを開く」では、説明スライドから通常のコード演習へ進みます。
`app/page.tsx`の見出しと`app/api/question/route.ts`のquery別JSONを編集し、
保存して起動・反映した後、同じ実サーバーのpageと2つのGET応答を判定します。
Pagesでは説明と読書を提供し、Nextサーバーは起動しません。下書きと進捗は端末データJSONで移行します。
Nextの固定依存・資源・CSP・採点範囲は[最初のNext Lessonの契約](docs/quality/next-first-lesson.md)、限定POSTは[Form/Actionの固定契約](docs/quality/next-form-action-boundary.md)を参照してください。

保存・Resetの確認範囲と制約は[常駐Workspace設計・検証記録](docs/quality/local-resident-workspace.md)にあります。
通常の停止・再起動・`down`はSource volumeを保持します。`down --volumes`やvolume pruneは行わないでください。

停止は起動Terminalで`Ctrl+C`、サービスと専用networkの片付けは次のコマンドです。再起動はもう一度`./scripts/learn.sh`を実行します。

```bash
./scripts/learn.sh down
```

4173番または4175番の競合で起動できない場合は、既に起動した学習モードを確認し、他の作業のサービスを勝手に停止せず競合を解消してください。Host/Originの安全確認があるためportだけを変更しないでください。Docker切断時はDockerと学習モードを起動し直して、画面の「プレビューを更新」または「判定する」で再試行します。Browserへの自動切替はありません。

PagesとLocalはOriginが異なり、IndexedDBは自動同期しません。移行元HomeからJSONを書き出し、移行先Homeで読み込み差分を確認して反映します。教材ID・進捗・下書き・採点履歴の形式は共通です。

## 端末データ、容量、引き継ぎ

ログインとクラウド同期はありません。進捗、下書き、初回完了日時は現在のOriginのIndexedDBへ保存されます。Homeの「この端末の学習データ」から次を操作できます。

- 全コースの進捗と下書きをJSONへ書き出す
- 10 MiB以下のJSONを選び、既存データとの差分と教材更新による初期化理由を確認してから読み込む
- ブラウザへ永続保存を要求し、現在の使用量とブラウザが割り当てた上限の目安を確認する
- 端末データを明示確認後に削除する

保存上限は端末、ブラウザ、空き容量により異なります。保存に失敗した場合は最新下書きをメモリへ救済し、常設警告、再試行、緊急書き出しを表示します。警告中は「保存済み」と誤表示しません。

別端末や別Originへは自動で移りません。Repository名、Owner、Custom Domainなど公開URLを変更する前や、スマートフォンからPCへ移る前に、旧環境でJSONを書き出してください。PCではJSONを読み込み、表示された差分を確認してから反映します。

同じ演習を複数タブで開いた場合は、編集中の1タブだけがleaseを保持します。別タブから編集を引き継ぐときは、画面の明示操作で所有権を移します。

Slideは文章・コード・結果を教材の記述順に表示します。静的な出力例は実行結果と区別し、注目行と前提コードの折り畳みで読み比べられます。[3 Lessonの改訂と記法](docs/quality/issue-21-slide-examples.md)に仕様・検証範囲を記録しています。

## 教材SourceとProvenance

教材の唯一のSource of truthは`content/html-css/`です。生成物を直接編集しません。

- `content/html-css/course.yaml`: コース構造、公開状態、教材Revision
- `content/html-css/concepts.yaml`: Conceptの前提関係、初出Slide、Project要求Level
- `content/html-css/chapters/`: 章、レッスン、演習、ルール、ヒント
- `content/html-css/slides/`: スライド本文
- `content/html-css/workspaces/`: Starter、Solution、負例Fixture
- `content/html-css/assets/`: 教材Asset
- `content/html-css/provenance.yaml`: 全SourceとAssetの由来、作成方法、公開可否
- `content/learning-paths/`: 公開コースを束ねるおすすめ学習順
- `public/generated/content/`: 開発用の未追跡生成物
- `dist/`: Production Buildの未追跡生成物

SourceやAssetを追加したら、同じ変更で`provenance.yaml`へ登録します。利用者へ配信するものは`visibility: public`、SolutionやFixtureなど品質確認専用のものは`visibility: authoring`にします。次の検査は未登録Source、hash不一致、公開Artifactへのauthoring data混入を拒否します。

```bash
./scripts/docker-compose.sh run --rm app npm run content:provenance
./scripts/docker-compose.sh run --rm app npm run content:check
```

ページ送りMetadataとConcept習得条件のcoverageは現在不足0件です。同じ不変条件はChapter別Vitest契約として`npm run check`へ含まれます。次の単独Reportは対象Lesson、Slide、Exercise、Conceptを安定した順序で詳しく確認する診断用で、不足があれば終了Code 1になります。

```bash
./scripts/docker-compose.sh run --rm app npm run content:coverage
```

## 品質ゲート

新規セッションでJavaScript教材を扱う担当は、[通常公開基準（正本）](docs/quality/javascript-normal-release-policy.md)と[3ペルソナ評価runbook](docs/quality/javascript-agent-learning-runbook.md)を確認します。教材別台帳の保存先は`docs/quality/javascript-agent-learning.yaml`（現treeでは未作成）です。実記録があればrunbookの`release:learning-coverage`手順で確認済み／未確認を区別します。新規・未確認教材だけ3人で一度評価し、確認済み評価・原証拠・本人checkpointは新しいセッションでも引き継ぎます。

作業中とpush/PRの`check`は、教材Compile、Lint、変更関連test、型検査を含むProduction Build、学習用Chunk分離を実行します。教材Reviewは通常Actionsの別ステップで警告・Summaryへ記録し、承認待ちでも動作検証を進めます。通常CIの成功は教材承認を意味せず、公開前の`check:release`ではReview失敗を必ず停止条件にします。testはGit差分とVitestのimport依存関係で選び、教材変更では動的読込のContent testも補います。依存・共通test設定の変更時だけ全Unit/Component/Content testへ拡大します。ローカルの差分基準は`HEAD`、CIではpush前のSHAまたはPRのbase SHAです。

通常Actionsはブラウザ未導入のDocker stageを使い、5分以内を目標、8分を上限とします。新しいpushで古い開発Runを取消し、公開Runとは待ち行列を分離します。詳しい選択基準と削除したtestは[開発中の検証方針](docs/quality/development-testing.md)に記載しています。

```bash
./scripts/docker-compose.sh run --rm app npm run check
./scripts/docker-compose.sh run --rm app npm run format:check
```

明示deployの`check:release`では教材Reviewと全Unit/Component/Content testを実行します。Chromiumの機能E2Eと代表画像比較、Firefox/WebKitの代表cross-browser smoke、固定演習の実ブラウザ性能、配信量、Lighthouse Mobileもこの公開Runで実行します。重複する画像比較17ケースは`npm run test:visual:extended`で対象変更時に明示実行します。画像比較の自動retryは行いません。Runtime、Security、Browser互換性へ触れた変更では、作業中に変更面の代表Browser検証を追加します。

公開Runは同じProduction buildのbundle容量/manifest/subpathとStatic Artifactを先に検査し、成功後にBrowser E2E・操作性能・Lighthouseへ進みます。単独の`test:performance`もbundle検査を先に行います。静的検査済みの公開Runでは`test:performance:browser`で重複を避けます。

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:bundle
./scripts/docker-compose.sh run --rm app npm run release:check -- --course-id html-css
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:e2e
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:performance:browser
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:lighthouse
```

主な性能予算はLCP 2,500 ms以下、CLS 0.1以下、主要操作200 ms以下、Preview p95 500 ms以下、HTML/CSS判定p95 300 ms以下、下書き永続化500 ms以下です。JavaScript縦切りは初回Preview p95 500 ms以下、再Preview p95 250 ms以下、通常判定p95 1,000 ms以下、標準Scenario p95 1,500 ms以下、Guided累積判定p95 3,000 ms以下、JavaScript固有incremental lazy graph gzip 180,000 bytes以下を別Gateで測定します。Home初期JavaScriptはgzip 256,000 bytes以下とし、Editor、Analyzer、Runner、ValidatorをHomeやSlideで読み込みません。教材配信はCatalog v3 gzip 20,480 bytes、Course Index 40,960 bytes、各Lesson Manifest 12,288 bytes、route map追加分8,192 bytesを上限にします。予算の完全な固定値は`content/html-css/performance.yaml`、`content/javascript/performance.yaml`と独立固定テストで管理します。

Home初期JSの過去版比増分20,480 bytesは警告値です。絶対上限256,000 bytesや実測性能の条件は必須のまま維持します。検証範囲・任意画像の対応表・再検証条件は[開発中の検証方針](docs/quality/development-testing.md)を参照してください。

アクセシビリティは、意味のあるLandmarkと見出し、本文スキップ、Keyboard操作、Focus管理、CodeMirrorからの脱出、Reduced Motion、320 CSS px reflow、200%/400% Zoom、WCAG A/AAのaxe検査を対象にします。自動検査に加え、Keyboard／Zoom／Reflowの実機結果を`docs/quality/a11y-manual.md`へ記録します。VoiceOverの手動実機確認は初回Release対象外で、対応済みとは主張しません。

## GitHub Pages相当のSubpath確認

`repository-name`を公開先Repository名へ置き換えます。

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run smoke:subpath
```

Smokeは、HTMLが参照する初期Asset、教材Catalog v3、Course Index、Lesson Manifest、Viteの静的import、安全な相対Path、Service Worker不在、配信容量を検証します。Course mapではIndexまで、Slideでは現在Lessonだけを取得するため、51 Lesson全体を初期表示で配信しません。このコマンドだけでは公開しません。

## GitHub Pagesへの公開

公開は`main`へのpushだけでは始まりません。HTML/CSSは既存5品質記録と`docs/quality/release-approval.yaml`、JavaScriptはJS専用7記録と`docs/quality/javascript-release-approval.yaml`へ対象を固定します。JSの全52 Lesson（46 standard・5 Guided・1 Capstone、14章・4 Phase、1,010分）の教材評価は、新規・未確認Lessonだけ独立3役で一度実施し、確認済みは保持します。実在初心者・自然な誤解頻度・物理実機の証明ではなく、HTML/CSSの真人5Checkpoint条件を代替しません。実証前の記録はdraftです。

dispatch直前に最新main SHAを固定し、承認済みProduct commit P以降に品質記録・literal履歴以外のProduct変更がないworkflow head Mを確認します。`source_sha`はP、RunのheadはMへ結びます。自分のcommit SHAを同じcommit内の記録へ埋めません。`github-pages`の既存保護はmain限定で、2026-10-02確認時はrequired reviewer未設定です。Environment通過を記録し、取得していない独立Environment人承認を主張しません。

```bash
gh workflow run "TsumuCode Pages" --ref main -f course_id=javascript -f source_sha=<40文字の承認済みProduct_SHA> -f release_mode=candidate -f deploy=true
```

`course_id`は`html-css`または`javascript`に限定し、選択で全site品質・閾値・Action pin・permissionsを減らしません。Source SHA、全canonical `dist/` digest、選択Course/Public Provenance hash、Chromium全E2E、Firefox/WebKit代表smoke、a11y、Security、Performance、静的Artifactを結び付けます。JSでも既存HTML continuityをquality-onlyで検査します。公開後はEnvironment通過、同じRunのActions Report、annotated tag、公開URLを実確認し、HTMLは`docs/quality/post-deploy/<revision>.yaml`、JSは`docs/quality/post-deploy/javascript/<revision>.yaml`へ記録してから履歴へ追記します。JSでは開始・再開・採点・保存・Export・別状態Importも個別に観測します。

JSの教材別評価は観測時の元Sourceと原証拠を保持し、全体commit/hash・test・設定・容量変更や新規セッションを理由に全コース再学習しません。可視教材内容が変わった場合は対象Lessonだけ未確認へ戻します。Docker内の`release:input -- --source-sha <固定SHA> --output <新規path>`は公開入力監査のmanifestを保存し、原本を上書きしません。最終候補のHome・Path・Library・直接開始・途中再開smokeは公開担当が一度実施し、現在のP/Dfinalへ別に結びます。private原本は公開せず、原report/操作証拠digestと独立原本照合reviewを固定します。詳細は[教材別台帳と公開binding](docs/quality/javascript-agent-learning-runbook.md#台帳と公開binding)を参照してください。

S/Pの候補観測は公開前の実loopback HTTP URLを記録します。`inputValidity`の`draftCandidate`と`finalCandidate`へroot観測のrun/source/D/config/helper/原証拠hashを別々に固定し、最終smokeの`candidateRunId`/URLを照合します。root観測原本の独立照合も必要です。未配信Pを本番HTTPS観測済みとして記録しません。公開後は従来のPages HTTPS/Run/Artifact/実操作記録を要求します。

学習入力scope v2は実`compose.yaml`/`compose.learning.yaml`/Dockerfile/実行helper/固定検証設定と追加・削除も含めます。JSのP→M/candidate除外/promotion/workflowは、選択JSの7記録・approval・history・対象revisionのpostdeployという同じliteral集合へ結合します。合成bundle更新はpromotionだけに限定し、Product hashの元bundle overrideで検査します。未登録`docs/quality/`、他Course、私有raw log、`docs/superpowers/`はJSの除外にしません。HTML旧契約は維持します。

身内向けβは、mainのSHAを指定して正式候補と同じ公開前gateを通したうえで、次のように明示dispatchします。

```bash
SOURCE_SHA="$(git rev-parse origin/main)"
gh workflow run "TsumuCode Pages" --ref main -f course_id=html-css -f source_sha="$SOURCE_SHA" -f release_mode=beta -f deploy=true
```

βでは初心者全コースを観察済みとは主張せず、正式Releaseのtagや公開台帳は作成しません。

初回のJS通常公開履歴は`content/javascript/release-history.yaml`の`releases: []`から始めます。旧βは登録済みの通常Releaseやrollback先へ移しません。合成進捗bundleは移行用の検証データで、純粋Serviceの検査成功を実IndexedDBの移行・dated backup・実学習の成功へ読み替えません。

公開履歴は元Runの`release-report-<source SHA>` Artifactを用い、選択Courseの`content/<course_id>/release-history.yaml`へ承認済みcandidateを1件だけ移します。Quality/Report Artifact ID/digest、workflow head/run/attempt、公開URL、JSの元S/Ddraft/input hashを記録し、次candidateはbindingとIDを空にしたdraftへ戻します。rollbackは同じCourseの登録済みReleaseだけを選び、未登録βや別Courseを使いません。両Courseのtag unionとCourse別chainを検査し、未知/重複tagは停止します。

```bash
git fetch --tags
gh run download <run ID> -n release-report-<source SHA> --dir .release-evidence
./scripts/docker-compose.sh run --rm app npm run release:continuity -- --course-id javascript --promote --report /workspace/.release-evidence/release-report.md
```

`--promote`は、Deployに使ったworkflow headの台帳から既存Release prefixが変わっていないこと、追記が1件だけであること、承認source以降にProduct差分がないこと、全tagがannotated tagで正しいcommitを指すこと、tag message・Release Report・Quality/Report Artifact・公開URLが完全一致することを検証します。さらにrevision別の公開後記録が同じrevision、source、workflow head、run/attempt、Report Artifact、公開URLへ結び付き、共通4項目すべて`passed`で、JSでは開始・再開・採点・保存・Export・別状態Importの6実操作も`passed`であり、そのpath/hashが公開台帳と一致することを必須にします。公開後も`release:continuity`が全Releaseの記録hashを再検証します。

tag ref作成後の通信断などでRunだけが失敗表示になった場合、Workflow全体を再実行して新しい`run_attempt`やArtifactを既存tagへ結び直してはいけません。元Runの`release-report-<source SHA>`を取得し、tag message・Report・公開URLを照合してrevision別の公開後記録を作成し、その元Run evidenceから`--promote`します。既存tagを検出したRunは成功扱いにせず停止します。

## 非対象

TypeScriptコースの準備として、実コンパイラ・停止可能な専用Worker・既存JavaScript安全解析・隔離プレビュー・動作採点をつなぐ[型検査境界の技術実証](docs/quality/typescript-compiler-boundary.md)を追加しています。型検査失敗は未実行・未採点として区別し、元TSと実行結果を照合します。検証用TS教材を実演習画面へ読み込み、Console・修正後の採点・元コードの保存/再読込まで確認しました。[型注釈1課題の採点契約](docs/quality/typescript-annotation-grading-contract.md)では、元TSの明示的なnumber注釈と実Consoleの結果を両方確認します。TSコースの教材全体・残りの型習得要件・公開登録は未完了です。

[型推論1課題の採点契約](docs/quality/typescript-inference-grading-contract.md)では、注釈なしのletから推論された数値型と実Consoleを両方確認し、明示注釈の課題とは専用profileで区別します。`content/typescript`に15Lesson・60枚・320分のdraft Courseを登録し、型推論→型注釈→型消去・実行時失敗→Question/interface→状態のunionと絞り込み→optional値→関数型・generic・readonly→DOMとEvent→unknownの実検証→非同期と失敗処理→同じクイズの段階制作の順序と用語の初出を統合しています。型消去の課題は動作条件、Questionは[有限なinterface型条件と動作の両方](docs/quality/typescript-question-interface-grading-contract.md)、union/optionalの2課題は[分岐で読む値と実出力](docs/quality/typescript-conditional-grading-contract.md)を判定します。再利用の3課題は[関数型・入出力の型関係・readonlyと実出力](docs/quality/typescript-reusable-grading-contract.md)、境界の3課題は[対象・unknown・非同期の型条件と実DOM操作](docs/quality/typescript-boundary-grading-contract.md)を確認します。type aliasも形に名前を付けられると説明し、個々の演習条件と一般のTypeScriptを区別します。[初回2Lesson](docs/quality/typescript-draft-course-integration.md)・[#109](docs/quality/issue-109-type-erasure-integration.md)・[#110](docs/quality/issue-110-question-interface-integration.md)の記録を保持し、制作の3工程は[型と実クイズ操作の固定契約](docs/quality/typescript-quiz-project-grading-contract.md)で積み上げます。Home/Pathへの掲載と公開受入は未完了です。

[型消去と実行時失敗の次教材原稿](docs/quality/typescript-ch01-l03-draft/AUTHORING.md)は、型注釈が生成JSから消えることと、型が通ってもthrowで実行が止まることを4枚・15分・9Fixtureで扱います。動作課題としてConsoleを判定し、型注釈の有無は採点条件にしていません。独立内容レビューと通常Courseへの登録は未完了です。

- 初回公開版でのJavaScript、TypeScript、Reactコース
- ログイン、Backend、Cloud DB、端末間の自動同期
- スマートフォン上でのコード編集
- 利用者コードからの外部Network、Storage、親画面操作
- Progateの教材、課題、UI、名称、ロゴ、キャラクターの複製や互換性

## 独立制作と権利方針

TsumuCodeは個人・身内向けに制作した非商用の独立学習サイトです。教材・課題・UI・画像資産は独自制作し、他社サービスの名称、ロゴ、キャラクター、教材、画面資産を流用しません。この説明は学習画面の限られた表示領域を消費しないようRepository文書で管理します。

## 予測と任意の追加練習

HTML/CSS導入とClosureの一部スライドには「考えてみよう」があります。「答えと理由を見る」を開く前に結果を予測し、理由を照合します。開閉は演習合格や習得率として保存しません。Closureは既存ガイドに加え、毎回初期化されるコードの修正と、増分が異なる2つの係を使う任意練習を選べます。詳しい範囲と未実施の初心者観察は[パイロット記録](docs/quality/issue-23-learning-practice.md)に記載しています。
