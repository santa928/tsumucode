# TsumuCode

TsumuCodeは、スライドで仕組みを理解し、ブラウザ上でコードを書き、プレビューと自動判定で確かめる個人・身内向けの非商用フロントエンド学習サイトです。ログインやBackendを必要とせず、GitHub Pagesだけで動作します。

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

Homeでは、複数のコースをおすすめ順に並べる「学習パス」を最初の導線として表示します。学習パスは順番を案内する設計図であり、各コースは独立して開始・完了できます。前のコースが未完了でもロックされず、学びたいコースから直接始められます。

現在公開している「フロントエンド学習パス」にはHTML/CSSコースだけを収録しています。JavaScript、TypeScript、Reactなどのコースは、教材と品質確認が完成してから順次このパスへ追加します。学習パスの直リンクは[`#/paths/frontend`](http://localhost:5173/#/paths/frontend)です。

JavaScriptは、安全な複数ファイル実行基盤とChapter 00〜06の27 Lesson／108 Slide／27 Exercise（420分）を`draft`として品質検証中です。値・条件分岐・Function・Arrayから`map`・`filter`・`reduce`・immutable update、Module・Error・Debugまでを学べます。Home、公開学習パス、スライド閲覧モードにはまだ掲載しません。開発時は[最初のJavaScriptスライド](http://localhost:5173/#/courses/javascript/lessons/javascript-ch00-l01/slides/javascript-ch00-l01-s01)、[Chapter 06の最初のスライド](http://localhost:5173/#/courses/javascript/lessons/javascript-ch06-l01/slides/javascript-ch06-l01-s01)、[Debug演習](http://localhost:5173/#/courses/javascript/lessons/javascript-ch06-l04/exercises/javascript-ch06-l04-e01)の直接URLから確認できます。`draft`は非掲載を意味するだけで、Production Artifactへ含まれる教材を機密情報として扱うものではありません。

学習パスの進捗は、この端末に保存された各コースの進捗からその都度計算します。学習パス専用の進捗Recordは作らないため、既存の書き出し・読み込み形式や各コースの下書きはそのまま利用できます。

## スライドだけ見る

外出先などで読むだけの場合は、Homeの「スライドだけ見る」から目次を開きます。

閲覧モードは通常学習の進捗、再開地点、下書きを参照・更新しません。目次と各スライドはHash URLを再読込・共有できます。通常学習へ戻ると、Course Map以降は通常の端末保存が再開します。

GitHub Pagesへ公開した後のHTML/CSSコースの直リンクは、[スライド目次](https://santa928.github.io/tsumucode/#/library/html-css)です。

## 学習方法

1. Homeの教材棚から「HTML/CSS はじめの一歩」を選びます。
2. コースマップから現在のレッスンを開きます。
3. スライド一覧、前後ボタン、左右矢印キーで概念を学びます。
4. PCでは手順、Editor、Preview、判定操作を固定Workspace内で見比べながらHTML/CSSを編集します。Tab／Shift+Tabで字下げし、Editorを出るときはEscapeの後にTabまたはShift+Tabを押します。
5. 不合格時は段階ヒントを開くか、コードと判定履歴を保ったまま関連スライドを重ねて見直します。
6. 合格後は完了画面とコースマップで進捗を確認します。

## 現在の実行環境

HTML/CSSとJavaScript演習は「ブラウザで実行」と表示し、既存の隔離Previewを利用します。実行できたことと教材の合格は別です。変数添字など現在のBrowser実行が扱えない書き方は「この環境では未対応」と案内し、未対応・制限停止・環境障害を採点履歴へ保存しません。編集内容と前回の成功結果は保持します。

ローカルDocker学習版では、既存のClosure演習1件を実Node.jsで実行できます。Python、Next.js、ターミナルは未実装です。Pagesや読書画面からlocalhostを探索しません。実行portと任意DOM portの境界・制限は[Issue #27の設計記録](docs/quality/runtime-execution-boundary.md)に記載しています。

## ローカルNode.js学習

Dockerを起動し、リポジトリ直下で次を実行します。初回は固定Nodeイメージの取得と学習画面のbuildを行います。ホストへのNode/npm導入は不要です。

```bash
./scripts/learn.sh
```

[http://127.0.0.1:4173/](http://127.0.0.1:4173/)を開き、「ClosureをNode.jsで実行する」を選びます。`localhost`ではなくこのURLを使ってください。最初のコードを「プレビューを更新」で実行すると0、0と出力します。`score += 0`を`score += 10`に直して再実行すると10、20になります。「判定する」で教材条件を確認します。実行中は「実行を停止」で中止できます。編集だけではNodeは起動せず、下書きは従来どおり自動保存します。

対象は`javascript-ch03-l05-e01`だけです。他のHTML/CSS・JavaScript演習はBrowser実行を維持します。NodeにDOMはありません。終了コード0でも教材条件を満たさなければ合格にはなりません。停止・制限到達・接続障害は不正解履歴へ保存しません。

学習用webと信頼controllerは開発用appから分離しています。**controllerだけがDocker管理socketを持ち、これはホスト管理に相当する強い権限です。** 学習コードは別の使い捨てコンテナへ渡し、非root・read-only・ネットワークなし・host mountなしで実行します。同時1件、5秒、256 MiB、PID 64、出力64 KiBが上限です。第三者の敵対コードを安全に実行する公開サービスではありません。詳細とAPI仕様は[Local Node設計・検証記録](docs/quality/local-node-runtime.md)にあります。

停止は起動Terminalで`Ctrl+C`、サービスと専用networkの片付けは次のコマンドです。再起動はもう一度`./scripts/learn.sh`を実行します。

```bash
./scripts/learn.sh down
```

4173番の競合で起動できない場合は、既に起動した学習モードを確認し、他の作業のサービスを勝手に停止せず競合を解消してください。Host/Originの安全確認があるためportだけを変更しないでください。Docker切断時はDockerと学習モードを起動し直して、画面の「プレビューを更新」または「判定する」で再試行します。Browserへの自動切替はありません。

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

作業中とpush/PRの`check`は、教材Compile・Review、Lint、変更関連test、型検査を含むProduction Build、学習用Chunk分離を実行します。testはGit差分とVitestのimport依存関係で選び、教材変更では動的読込のContent testも補います。依存・共通test設定の変更時だけ全Unit/Component/Content testへ拡大します。ローカルの差分基準は`HEAD`、CIではpush前のSHAまたはPRのbase SHAです。

通常Actionsはブラウザ未導入のDocker stageを使い、5分以内を目標、8分を上限とします。新しいpushで古い開発Runを取消し、公開Runとは待ち行列を分離します。詳しい選択基準と削除したtestは[開発中の検証方針](docs/quality/development-testing.md)に記載しています。

```bash
./scripts/docker-compose.sh run --rm app npm run check
./scripts/docker-compose.sh run --rm app npm run format:check
```

明示deployの`check:release`では全Unit/Component/Content testを実行します。Chromiumの全E2E、Firefox/WebKitの代表cross-browser smoke、固定演習の実ブラウザ性能、配信量、Lighthouse Mobileもこの公開Runだけで実行します。Runtime、Security、Browser互換性へ触れた変更では、作業中に変更面の代表Browser検証を追加します。

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:e2e
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:performance
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:lighthouse
```

主な性能予算はLCP 2,500 ms以下、CLS 0.1以下、主要操作200 ms以下、Preview p95 500 ms以下、HTML/CSS判定p95 300 ms以下、下書き永続化500 ms以下です。JavaScript縦切りは初回Preview p95 500 ms以下、再Preview p95 250 ms以下、判定p95 1,000 ms以下、JavaScript固有incremental lazy graph gzip 180,000 bytes以下を別Gateで測定します。Home初期JavaScriptはgzip 256,000 bytes以下とし、Editor、Analyzer、Runner、ValidatorをHomeやSlideで読み込みません。教材配信はCatalog v3 gzip 20,480 bytes、Course Index 40,960 bytes、各Lesson Manifest 12,288 bytes、route map追加分8,192 bytesを上限にします。予算の完全な固定値は`content/html-css/performance.yaml`、`content/javascript/performance.yaml`と独立固定テストで管理します。

アクセシビリティは、意味のあるLandmarkと見出し、本文スキップ、Keyboard操作、Focus管理、CodeMirrorからの脱出、Reduced Motion、320 CSS px reflow、200%/400% Zoom、WCAG A/AAのaxe検査を対象にします。自動検査に加え、Keyboard／Zoom／Reflowの実機結果を`docs/quality/a11y-manual.md`へ記録します。VoiceOverの手動実機確認は初回Release対象外で、対応済みとは主張しません。

## GitHub Pages相当のSubpath確認

`repository-name`を公開先Repository名へ置き換えます。

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run smoke:subpath
```

Smokeは、HTMLが参照する初期Asset、教材Catalog v3、Course Index、Lesson Manifest、Viteの静的import、安全な相対Path、Service Worker不在、配信容量を検証します。Course mapではIndexまで、Slideでは現在Lessonだけを取得するため、51 Lesson全体を初期表示で配信しません。このコマンドだけでは公開しません。

## GitHub Pagesへの公開

公開は`main`へのpushだけでは始まりません。最初に`docs/quality/release-checklist.md`を公開前条件だけで承認し、全記録を`release-approval.yaml`へ固定します。その40文字の承認済みSource SHAを指定して`TsumuCode Pages` workflowを明示dispatchし、`github-pages` EnvironmentのReviewerが承認した場合だけ、検証済みArtifactをDeployします。

```bash
gh workflow run "TsumuCode Pages" --ref main -f source_sha=<40文字の承認済みSHA> -f release_mode=candidate -f deploy=true
```

Workflowはpush/PRのfast gateと明示dispatchの公開前gateを分離します。公開前gateはSource SHA、canonical `dist/` digest、Course/Public Provenance hash、Chromium全E2E、Firefox/WebKit代表smoke、a11y、Security、Performance、静的Artifact検査を結び付けます。公開後はEnvironmentの独立承認、Actions Release Report、annotated tag、公開URLを実確認し、同じRunの値をrevision別の`docs/quality/post-deploy/<revision>.yaml`へ記録してから公開台帳へ追記します。Environment承認を省略した直接Deployや、公開後確認を公開前に合格扱いする運用は行いません。

身内向けβは、mainのSHAを指定して正式候補と同じ公開前gateを通したうえで、次のように明示dispatchします。

```bash
SOURCE_SHA="$(git rev-parse origin/main)"
gh workflow run "TsumuCode Pages" --ref main -f source_sha="$SOURCE_SHA" -f release_mode=beta -f deploy=true
```

βでは初心者全コースを観察済みとは主張せず、正式Releaseのtagや公開台帳は作成しません。

公開台帳へ追記するときは、対象Runの`release-report-<source SHA>` Artifactを`.release-evidence/`へ展開し、`content/html-css/release-history.yaml`の`releases`末尾へ承認済みcandidateを1件だけ移します。追記RecordにはQuality/Report Artifact IDとdigest、workflow head/run/attempt、公開URLを記録し、`candidate`はbindingと`persistentIds`を空にした`draft`へ戻して`previousReleaseTag`を最新tagへ接続します。

```bash
git fetch --tags
gh run download <run ID> -n release-report-<source SHA> --dir .release-evidence
./scripts/docker-compose.sh run --rm app npm run release:continuity -- --promote --report /workspace/.release-evidence/release-report.md
```

`--promote`は、Deployに使ったworkflow headの台帳から既存Release prefixが変わっていないこと、追記が1件だけであること、承認source以降にProduct差分がないこと、全tagがannotated tagで正しいcommitを指すこと、tag message・Release Report・Quality/Report Artifact・公開URLが完全一致することを検証します。さらにrevision別の公開後記録が同じrevision、source、workflow head、run/attempt、Report Artifact、公開URLへ結び付き、4項目すべて`passed`で、そのpath/hashが公開台帳と一致することを必須にします。公開後も`release:continuity`が全Releaseの記録hashを再検証します。

tag ref作成後の通信断などでRunだけが失敗表示になった場合、Workflow全体を再実行して新しい`run_attempt`やArtifactを既存tagへ結び直してはいけません。元Runの`release-report-<source SHA>`を取得し、tag message・Report・公開URLを照合してrevision別の公開後記録を作成し、その元Run evidenceから`--promote`します。既存tagを検出したRunは成功扱いにせず停止します。

## 非対象

- 初回公開版でのJavaScript、TypeScript、Reactコース
- ログイン、Backend、Cloud DB、端末間の自動同期
- スマートフォン上でのコード編集
- 利用者コードからの外部Network、Storage、親画面操作
- Progateの教材、課題、UI、名称、ロゴ、キャラクターの複製や互換性

## 独立制作と権利方針

TsumuCodeは個人・身内向けに制作した非商用の独立学習サイトです。教材・課題・UI・画像資産は独自制作し、他社サービスの名称、ロゴ、キャラクター、教材、画面資産を流用しません。この説明は学習画面の限られた表示領域を消費しないようRepository文書で管理します。
