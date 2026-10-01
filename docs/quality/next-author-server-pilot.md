# Next.js pageとRoute Handlerの作者用Starter

Issue #14 / #25 Bの最初の経路へ向けた固定作者原稿の技術準備。通常Course、学習者の任意source、管理API、常駐Project基盤、採点器には接続しない。TS/Reactの学習前提と正式公開条件は維持し、人手待ちで進められる少量Starterだけを扱う。

## 要件台帳と差分

| ID          | 区分 | 受入条件                                                                                   |
| ----------- | ---- | ------------------------------------------------------------------------------------------ |
| REQ-NAP-001 | 維持 | 本物のNext.js/Node、page＋Route Handlerを使い、static exportや独自Routerで代用しない       |
| REQ-NAP-002 | 維持 | 固定依存とlockfile、実HTTP応答、編集反映、停止/再開、元sourceの保護を区別する              |
| REQ-NAP-003 | 追加 | 信頼した作者の固定1Projectだけ新規tmpへ展開する。通常教材/採点/learner Runtimeへ接続しない |
| REQ-NAP-004 | 維持 | #25 Bの管理資格情報/Cookie分離、実行revision、資源上限/idle終了は別の未完条件として残す    |
| REQ-NAP-005 | 維持 | 初心者/実機/正式公開の受入、既存性能予算と公開Gateを保持する                               |

保留・削除はない。追加1件は既存最初のStarterを作者の信頼コードへ限定した準備で、全Next.js Courseや新しい性能契約を確定しない。

## 固定入力と準備

2026-10-02に公式Installation/Route Handler仕様とnpm registryのversion/engines/peerDependencies/integrityを確認し、作者試作にNext16.3.8を固定。既存Node24.18.0/React・React DOM19.2.7/TypeScript6.0.3/型定義versionは変更しない。公式Node最低20.9とReact peer条件に既存pinが入る。App Routerの内部ReactとmanifestのReactを同一実体だと説明しない。

[Installation](https://nextjs.org/docs/app/getting-started/installation)、[Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route)を一次資料とした。文章/例は独自原稿。Tailwindやcreate-next-appの既定セットを追加しない。

固定manifestと6作者fileはscripts/content/fixtures/next-author-pilot.json、lockfileはnext-author-pilot.lock.json。probeNextAuthorPilot.tsは専用/evidence/next-author-pilot/source-*へ展開とhash記録だけを行い、install/build/server成功とは表示しない。

依存取得は準備工程としてDockerから公式npm registryへ行い、固定lockを使用。作者Projectの依存は一時ディレクトリ内だけに置き、rootのpackage/lock/共有node_modulesへ追加しない。秘密値/外部API/有料サービスを使わない。Next telemetryは作者プロセスの環境で無効にする。

## 表示語彙と最初の経路

語彙は学習ノートの本文、見出し、実HTTPへのリンク、作者用の未接続案内。淡い背景と読める文字だけを使い、操作は本文の流れへ配置する。固定高さ/画面比率のHUDを作らない。

pageは固定見出しと作者案内。GET Route Handlerは実requestのmode queryで2種類のmessageを返す。データや現在時刻の固定出力だけをサーバー能力とせず、異なる実リクエストを照合する。フォーム/Server Action/Cookie/cache/revalidationはこの原稿では未検証。

作者だけの確認順序:

1. Dockerで固定fileを展開し、lockから依存を準備する。これは通信を行う準備工程。
2. 実Next build/型検査を確認し、実dev serverを起動。HTTP成功と期待本文を確認して準備完了とする。
3. 実Browserでpageと実HTTPを確認し、同じ作者Projectを編集して反映を確認。
4. 今回のプロセスだけ停止し、sourceを保持して再開、最後に停止を確認する。

この作者用Dockerはリポジトリを持つ通常開発環境であり、学習者の信頼できないコードをここへ渡さない。別origin/Cookie/資格情報の境界・socketを持たないlearner・資源回収/idle・revision付き採点の製品契約を実証したとは扱わない。

## 検証状態と限界

- [x] 固定依存準備、実Next buildと型検査。
- [x] pageとRoute Handlerの実HTTP・実Browser・代表viewport目視。
- [x] 作者source編集反映と停止/再開、元source保持。
- [ ] 最新HEAD独立Proレビューと必要CI。
- [ ] #25 Bの製品隔離/保存/revision/idle/停止回収、通常教材、初心者/実機/正式公開。

非対象は任意npm install/自由外部通信/PTY/全Course/新公開先/費用/秘密値利用。製品入力が不変なら全製品Browser/Visual/性能/Lighthouseを毎回追加せず、公開前の既存Gateを未実行として保持する。

リスクは作者用実サーバーを学習者の安全なProject基盤と誤認すること、静的page表示をrequest時処理の証拠へ広げること。scopeと別のHTTP応答を明記し、製品化前の管理/Preview/資格情報/保存/実行revision/停止/資源上限を未完のまま追跡する。新しい性能目標を承認済みとしない。

- [x] 受入条件、非対象、リスクと対策、既存性能目標の保持を確認。

## 実測記録（2026-10-02）

- Docker Linux arm64/Node24.18.0で作者スクリプトのESLint、プロジェクトtypecheck、4ファイル書式と展開を確認。初回LintのZod非推奨passthrough2箇所は同じ未知lock属性を許すlooseへ修正し、再確認で成功。Gate/期待値を変更していない。
- 作者用lockのNext16.3.8 integrityを公式registryの同versionへ照合。新規tmpにnpm ci --ignore-scriptsで28依存を準備し、実install値の全7直接依存pinを照合。npmの当該29package監査表示は0件。rootの依存/lock/共有node_modulesへ追加しない。全製品の安全監査済みとは言わない。
- 実Next build成功と別の実tsc --noEmit成功。buildのpageは○（事前生成された静的内容）、/api/questionはƒ（request時動的処理）。pageが毎requestでServer Componentを実行した証拠とは分ける。生成後に作者6file/manifest/lockの8SHAが展開時と同一。
- 実Chromium149.0.7827.0、1280×800/390×844で作者pageと未接続案内・HTTPリンクを観察。doc幅は各viewportと一致、main右端1024/390・下端274.515625、全子要素の境界内、3画像（初期2viewport/編集後desktop）を目視。page/console ErrorとBrowser外部origin通信は0。
- 実Next devをコンテナ内部loopback4260だけで起動。HTTP200のpage本文でreadinessを確認し、2queryの実HTTP JSONが別messageになることを照合。OpenAPIはnext-author-pilot-openapi.yaml、管理APIではない。静的出力の直呼びやmockは使わない。
- 一時Projectのpage見出しとrouteのrevisionだけを編集。同じ実Browserで手動Reloadなしに見出し反映、実Next devのWebSocket frameを観測、実HTTPはauthor-1→author-2。停止して別processで再開後も同じ編集sourceのSHAとauthor-2応答を維持。これは固定作者の1経路で、6HTTP照合を6E2Eへ数えない。
- 主要リンクは実クリックで/api/question?mode=secondへnavigationし、HTTP200とauthor-2・2つ目のmessageを実Browser responseで照合。編集済み8sourceのhashを保持し、追加の専用serverも回収した。
- 最後に今回のprocess group3つを停止し、残存group0/4260 ECONNREFUSED、既存4215 HTTP200を実確認。他のpreviewやコンテナを停止せず、作者一時Composeは--rmで終了。source/lock/証拠は保持。

再現の入口はプロジェクトDockerで `./scripts/docker-compose.sh run --rm --no-deps -v /private/tmp:/evidence -e NEXT_TELEMETRY_DISABLED=1 app npm exec tsx scripts/content/probeNextAuthorPilot.ts`。出力prepared.jsonのsourceRoot内だけで固定lockのnpm ci --ignore-scripts、next build、tsc --noEmit、next dev --hostname 127.0.0.1 --port 4260を実行する。installは準備用の通信、serverはコンテナ内部だけの一時実行。Host npmや任意learner sourceへ転用しない。

今回sourceRootは/evidence/next-author-pilot/source-rezZQG（Host /private/tmp対応）。prepared/build/browser reportは各file SHA、実install版、HTTP JSON、停止/再開、境界値を記録。page元SHAは2eef9e7229c5a714845b26b6cffd49be50801677acb7ca060ca850935b3774c2、route元SHAは9cc8febad36d7c262724d39dd97dccc1a5c50b425ff45ef076e5f283bc4057cf、lock SHAはe7816fd5c4c058d8c91faec748b11d884fd6dcb332e8d6432332aff23d66cfcb。編集後page/routeのSHAはbrowser-reportへ別記し、元の追跡fixtureは変更しない。

実build/Browserの作者helperとログは私的一時証拠として保持。最新HEADの必要CIと指定Pro独立レビューをPR本文で別に追跡する。通常教材・学習画面の編集/保存・安全な常駐Workspace・管理/Preview origin・Cookie・Server Action・idle・revision付き採点・初心者/物理実機/正式公開は未完。
