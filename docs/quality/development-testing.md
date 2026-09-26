# 開発中の検証方針

開発中のpush/PRで30分の検査待ちを作らず、変更に対応する失敗だけを早く返す。

## 要件差分

| ID           | 状態 | 方針                                                                                                               |
| ------------ | ---- | ------------------------------------------------------------------------------------------------------------------ |
| REQ-TEST-001 | 維持 | Docker内で教材Compile・Review、Lint、型検査・Build、学習chunk検査を各1回実行                                       |
| REQ-TEST-002 | 追加 | Git差分とimport依存からtestを選択。教材の動的読込はContent suiteを補う                                             |
| REQ-TEST-003 | 削除 | 通常push/PRでの全test、Release continuity、Browser、性能、Lighthouse、Evidence生成                                 |
| REQ-TEST-004 | 維持 | 明示deployでは全Unit/Component/Content、Chromium全E2E、Firefox/WebKit代表smoke、性能、静的Artifact、Evidenceを実行 |
| REQ-TEST-005 | 追加 | 開発Runは5分以内を目標、8分上限。新pushで旧Runを取消し、Releaseと分離                                              |

REQ-TEST-003は開発の待機・無関係な失敗修正を減らすための変更。通常Runでは無関係な回帰を網羅しない。代替は対象testの手動指定と明示deployの全検証。共通依存・test設定変更では自動で全Unit/Component/Contentへ戻り、横断的変更や対象外回帰が判明した場合にも範囲を拡大する。ユーザーのIssue #6再見直し依頼により採用。

## 残す検査と削る検査

- Runtime、sandbox、保存・移行・Import、判定、実際の学習操作のtestは残す。
- package scriptの文字列、Dependencyのバージョン値、favicon/CSSの文字列、色の記法、Docker ignore項目、Vite設定値の写しは削除。実際のBuild、chunk/subpath検査、Lintと既存の操作testで確認する。
- Workflowのstep名やjobの列挙順は固定しない。公開条件、権限、入力の安全な扱い、Artifact証跡は残す。
- test数を目標にしない。機能変更時に壊れ得る動作だけ追加する。

## 使い方

`npm run check`は未コミット差分を対象とする。コミット後の変更を検査するときはDockerへ`TEST_BASE_SHA=<比較元SHA>`を渡す。CIではpushのbefore SHA、PRのbase SHAを使用する。差分がない場合はtestを起動しない。失敗したtestの自動retryは行わない。

`npm run check:release`と`npm run test:run`は全Unit/Component/Contentの明示実行用。Browser/Performance/Lighthouseは公開時またはその検査が必要な変更面で実行する。

## 受け入れ条件

- 通常Actionsは変更関連testとBuildだけで成功し、実測時間をIssueに記録する。
- ブラウザ入りイメージの作成、Release continuity、品質Evidenceを通常push/PRへ含めない。
- 同じ対象testを同一Runで重複実行しない。

## 非対象

製品機能、教材内容、本番Deploy、保存データの変更。

## リスクと対策

fsによる教材読込はimport依存に現れないためContent suiteを明示選択する。依存・共通設定変更では全testへ拡大する。通常CIで未選択のBrowser回帰は、変更時の代表Browser検証と明示deployで確認する。8分超は異常として終了し、無関係な重いGateを追加せず該当stepの時間を調べる。

## 性能目標

push/PRの実行時間5分以内、上限8分（Runnerの割当待ちは別）。Release Runはこの上限の対象外。
