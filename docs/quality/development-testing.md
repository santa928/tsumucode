# 開発中の検証方針

開発中のpush/PRで30分の検査待ちを作らず、変更に対応する失敗だけを早く返す。

## 初版の要件差分（2026-09-27）

| ID           | 状態 | 方針                                                                                                               |
| ------------ | ---- | ------------------------------------------------------------------------------------------------------------------ |
| REQ-TEST-001 | 維持 | Docker内で教材Compile・Review、Lint、型検査・Build、学習chunk検査を各1回実行                                       |
| REQ-TEST-002 | 追加 | Git差分とimport依存からtestを選択。教材の動的読込はContent suiteを補う                                             |
| REQ-TEST-003 | 削除 | 通常push/PRでの全test、Release continuity、Browser、性能、Lighthouse、Evidence生成                                 |
| REQ-TEST-004 | 維持 | 明示deployでは全Unit/Component/Content、Chromium全E2E、Firefox/WebKit代表smoke、性能、静的Artifact、Evidenceを実行 |
| REQ-TEST-005 | 追加 | 開発Runは5分以内を目標、8分上限。新pushで旧Runを取消し、Releaseと分離                                              |

REQ-TEST-003は開発の待機・無関係な失敗修正を減らすための変更。通常Runでは無関係な回帰を網羅しない。代替は対象testの手動指定と明示deployの全検証。共通依存・test設定変更では自動で全Unit/Component/Contentへ戻り、横断的変更や対象外回帰が判明した場合にも範囲を拡大する。ユーザーのIssue #6再見直し依頼により採用。

## 今回の要件差分（2026-09-28）

不要な失敗と再検証を減らしてmainへ直接pushする依頼に基づく改訂。初版との差分は以下。製品機能・教材・承認内容は変更しない。

| ID             | 状態 | 今回の方針                                                                                              |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| REQ-TEST-001   | 維持 | Compile、Lint、関連test、型・Build、chunk検査は通常CIの必須条件                                         |
| REQ-TEST-001-R | 削除 | 教材Review待ちで通常CIを止める条件。別ステップの警告にし、公開前のReview必須条件は維持                  |
| REQ-TEST-002   | 維持 | Git差分・import依存による選択とContentの動的読込補完                                                    |
| REQ-TEST-003   | 維持 | 通常push/PRに全Browser・性能・Lighthouseを追加しない                                                    |
| REQ-TEST-004   | 維持 | 公開前の全Unit/Component/Content、機能E2E、cross-browser smoke、実測性能・容量上限・Evidence            |
| REQ-TEST-004-V | 削除 | 全画像の毎公開実行と画像比較の自動retry。代表画面を必須とし、重複17ケースは明示実行へ移す               |
| REQ-TEST-004-B | 削除 | Home初期JSの過去版比20KB増分だけで停止する条件。警告へ変更し、全体256,000 bytes上限と初期混入検査を維持 |
| REQ-TEST-005   | 維持 | 通常CIは5分目標・8分上限、新pushで旧開発Runを取消                                                       |
| REQ-TEST-006   | 追加 | 再検証は変わった入力・検査対象に限定し、同一入力の成功証拠を再利用                                      |

削除理由はReview待ち・共通UI変更・軽微な容量増分による再実行を減らすため。失う検出範囲、代替検査、再拡大条件は以下。保留項目はない。

### 教材承認

`check`は教材承認を含めない。通常Actionsは同じDockerイメージで動作検証の後に`content:review`を別ステップとして実行し、失敗はwarningとJob Summaryへ記録する。通常CIの緑は教材承認を意味しない。未承認・欠落・hash不一致等は公開前の`check:release`で従来どおり停止する。台帳の自動承認やhashの自動更新はしない。

### 画像比較

`test:e2e`は`@visual-extended`の17ケースだけを除外する。機能E2E、a11y、responsive-layout、実教材Runnerの検証は減らさない。画像比較は差分閾値を維持し、自動retryを0にする。機能E2Eのretryは変更しない。

| 任意実行へ移す画像比較                | ケース数 | 通常残す代表・代替                                                                 |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| 共通6画面の1440px版                   | 6        | 同じ6画面の1280px・768px・390px、responsive-layout                                 |
| HTML/CSS診断の1440px版                | 1        | 1280pxで複数診断を表示                                                             |
| 閲覧目次・Viewerの1440px版／412px版   | 4        | 同じ2画面の1280px・768px・390px、Scroll到達の操作検証                              |
| JS Chapter 01/02/03の演習PC／スマホ版 | 6        | JS導入の演習PC／スマホ、複数ファイル演習、各ChapterのSlide、全教材Fixture・機能E2E |

これらの画像差分は通常公開では網羅しない。固有教材の見切れや幅依存の回帰が疑われる変更では、該当ケースを直接指定するか`npm run test:visual:extended`を実行する。共通UIの再設計では両範囲を実行する。画像ファイルは保存し、期待値の自動更新・閾値緩和は行わない。任意範囲で基準が古くなった場合は対象画像を目視して更新し、無関係な機能検証まで繰り返さない。

### 容量と再検証

Home初期JSの絶対上限256,000 bytes (gzip)、Editor／Runner等の初期混入、教材配信量、実ブラウザ性能目標は維持する。過去版比増分20,480 bytesの重複条件は警告1件へまとめる。増加の継続や実測性能悪化があれば該当import経路を調査する。過去の失敗値178,967 bytes（増分20,905）は警告、256,001 bytesは失敗となる。

修正後は入力が変わった対象を再検証する。期待画像だけなら該当画像比較、台帳だけなら教材Reviewと台帳検証、テストだけなら対象testとLint。製品Source・依存・Build条件が同じなら成功済みBuildや無関係なsuiteを再実行しない。共通基盤や広い変更、公開時には必須範囲へ戻す。異なるSource SHAへ過去の公開承認を流用しない。

## 残す検査と削る検査

- Runtime、sandbox、保存・移行・Import、判定、実際の学習操作のtestは残す。
- package scriptの文字列、Dependencyのバージョン値、favicon/CSSの文字列、色の記法、Docker ignore項目、Vite設定値の写しは削除。実際のBuild、chunk/subpath検査、Lintと既存の操作testで確認する。
- Workflowのstep名やjobの列挙順は固定しない。公開条件、権限、入力の安全な扱い、Artifact証跡は残す。
- test数を目標にしない。機能変更時に壊れ得る動作だけ追加する。

## 使い方

`npm run check`は未コミット差分を対象とする。コミット後の変更を検査するときはDockerへ`TEST_BASE_SHA=<比較元SHA>`を渡す。CIではpushのbefore SHA、PRのbase SHAを使用する。差分がない場合はtestを起動しない。失敗したtestの自動retryは行わない。

`npm run check:release`は教材Reviewと全Unit/Component/Contentを含む公開前検証、`npm run test:run`は全Unit/Component/Contentの明示実行用。Browser/Performance/Lighthouseは公開時またはその検査が必要な変更面で実行する。

## 受け入れ条件

- 通常Actionsは変更関連testとBuildだけで成功し、実測時間をIssueに記録する。
- ブラウザ入りイメージの作成、Release continuity、品質Evidenceを通常push/PRへ含めない。
- 同じ対象testを同一Runで重複実行しない。
- 教材承認待ちでも動作test・Buildを完走し、公開前には同じ未承認を拒否する。
- 画像の任意17ケースと通常ケースは重複せず、通常にPC・tablet・mobileと固有状態を残す。
- 過去版比の軽微な容量超過は警告、絶対上限超過は失敗する。

## 非対象

製品機能、教材内容、本番Deploy、保存データの変更。

## リスクと対策

fsによる教材読込はimport依存に現れないためContent suiteを明示選択する。依存・共通設定変更では全testへ拡大する。通常CIで未選択のBrowser回帰は、変更時の代表Browser検証と明示deployで確認する。8分超は異常として終了し、無関係な重いGateを追加せず該当stepの時間を調べる。

## 性能目標

push/PRの実行時間5分以内、上限8分（Runnerの割当待ちは別）。Release Runはこの上限の対象外。
