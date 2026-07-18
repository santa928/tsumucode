# TsumuCode

TsumuCodeは、スライドで仕組みを理解し、ブラウザ上でコードを書き、プレビューと自動判定で確かめる個人・身内向けの非商用フロントエンド学習サイトです。ログインやBackendを必要とせず、GitHub Pagesだけで動作します。

初回公開版は、完全初心者向けのHTML/CSSコースです。

- 14章、51レッスン、95スライド、45演習、学習時間の目安710分
- 5工程でプロフィールページを組み立てるGuided Project
- Briefから個人制作展サイトを完成させるCapstone Project
- スライドの前後移動と一覧、演習中の関連スライド見直し、段階ヒント
- HTML/CSS編集、隔離プレビュー、構造・見た目・アクセシビリティの自動判定
- 端末内の進捗・下書き保存、JSONでの書き出しと差分確認付き読み込み

## 対象者と対応環境

HTMLやCSSを初めて学ぶ人を対象にしています。スライドと進捗確認はスマートフォン、タブレット、PCで利用できます。

コード演習は、幅1024 CSS px以上かつマウスまたはトラックパッドを使えるPC向けです。小画面や編集条件を満たさない端末ではEditorとRunnerを読み込まず、スライド学習、進捗確認、完了済みコードの安全なPreview、PCへ渡す演習URLと学習データの書き出しを提供します。

主要FlowはChromium、Firefox、WebKitで検証します。JavaScriptが無効な環境と古いブラウザは対象外です。

## 必要なもの

- Docker Desktop
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

## 学習方法

1. Homeの教材棚から「HTML/CSS はじめの一歩」を選びます。
2. コースマップから現在のレッスンを開きます。
3. スライド一覧、前後ボタン、左右矢印キーで概念を学びます。
4. PCではHTML/CSSを編集し、プレビューと「判定する」で結果を確認します。
5. 不合格時は段階ヒントを開くか、演習画面を保ったまま関連スライドを見直します。
6. 合格後は完了画面とコースマップで進捗を確認します。

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
- `content/html-css/chapters/`: 章、レッスン、演習、ルール、ヒント
- `content/html-css/slides/`: スライド本文
- `content/html-css/workspaces/`: Starter、Solution、負例Fixture
- `content/html-css/assets/`: 教材Asset
- `content/html-css/provenance.yaml`: 全SourceとAssetの由来、作成方法、公開可否
- `public/generated/content/`: 開発用の未追跡生成物
- `dist/`: Production Buildの未追跡生成物

SourceやAssetを追加したら、同じ変更で`provenance.yaml`へ登録します。利用者へ配信するものは`visibility: public`、SolutionやFixtureなど品質確認専用のものは`visibility: authoring`にします。次の検査は未登録Source、hash不一致、公開Artifactへのauthoring data混入を拒否します。

```bash
./scripts/docker-compose.sh run --rm app npm run content:provenance
./scripts/docker-compose.sh run --rm app npm run content:check
```

## 品質ゲート

通常のSource検証、Lint、型検査、957件以上のUnit/Component/Content test、Production Build、学習用Chunk分離をまとめて実行します。

```bash
./scripts/docker-compose.sh run --rm app npm run check
./scripts/docker-compose.sh run --rm app npm run format:check
```

Production Build後、Chromium/Firefox/WebKitのE2E、固定10演習の実ブラウザ性能、配信量、Lighthouse Mobileを実行します。

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:e2e
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:performance
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run test:lighthouse
```

主な性能予算はLCP 2,500 ms以下、CLS 0.1以下、主要操作200 ms以下、Preview p95 500 ms以下、判定p95 300 ms以下、下書き永続化500 ms以下です。Home初期JavaScriptはgzip 256,000 bytes以下とし、EditorとRunnerをHomeやSlideで読み込みません。予算の完全な固定値は`content/html-css/performance.yaml`と独立固定テストで管理します。

アクセシビリティは、意味のあるLandmarkと見出し、本文スキップ、Keyboard操作、Focus管理、CodeMirrorからの脱出、Reduced Motion、320 CSS px reflow、200%/400% Zoom、WCAG A/AAのaxe検査を対象にします。自動検査に加え、KeyboardとVoiceOverの手動結果を`docs/quality/a11y-manual.md`へ記録します。

## GitHub Pages相当のSubpath確認

`repository-name`を公開先Repository名へ置き換えます。

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/repository-name/ app npm run smoke:subpath
```

Smokeは、HTMLが参照する初期Asset、教材Catalog、Course Manifest、Viteの静的import、安全な相対Path、Service Worker不在、配信容量を検証します。このコマンドだけでは公開しません。

## GitHub Pagesへの公開

公開は`main`へのpushだけでは始まりません。最初に`docs/quality/release-checklist.md`を公開前条件だけで承認し、全記録を`release-approval.yaml`へ固定します。その40文字の承認済みSource SHAを指定して`TsumuCode Pages` workflowを明示dispatchし、`github-pages` EnvironmentのReviewerが承認した場合だけ、検証済みArtifactをDeployします。

```bash
gh workflow run "TsumuCode Pages" --ref main -f source_sha=<40文字の承認済みSHA> -f release_mode=candidate -f deploy=true
```

WorkflowはSource SHA、canonical `dist/` digest、Course/Public Provenance hash、3 Engine、a11y、Security、Performance、静的Artifact検査を結び付けます。公開後はEnvironmentの独立承認、Actions Release Report、annotated tag、公開URLを実確認し、同じRunの値をrevision別の`docs/quality/post-deploy/<revision>.yaml`へ記録してから公開台帳へ追記します。Environment承認を省略した直接Deployや、公開後確認を公開前に合格扱いする運用は行いません。

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

## 独立制作と非提携Notice

TsumuCodeは個人・身内向けに制作した非商用の独立学習サイトです。Progateとは提携・関連していません。教材・課題・UIは独自制作です。この文言は全RouteのFooterから確認できます。
