# 著者順Slideの公開Gate追補

## 対象と原因

PR #36統合後のmain `96054f1674372035af14a990836a570060603e50`、β [Run 36323301869](https://github.com/santa928/tsumucode/actions/runs/36323301869)は公開前E2Eで8件失敗し、deploy/reportはskipした。診断Artifact `10933432483`の失敗画像とgh生ログを照合し、同一製品ソースのDocker Chromiumで8件を再現した。

- `javascript-ch02-layout` 2件: PCで本文の縦overflowなし、狭幅でStage overflow autoを要求していた。
- `responsive-layout` 6件: PC 4画面で本文の縦overflowなし、狭幅閲覧2画面でPagerが1段・56px以下を要求していた。
- PR #36は著者順を保つためPC Stage scroll／狭幅Shell scroll・2段Pagerを採用済み。旧固定収納の期待が残っていた。末尾までスクロールして本文・操作を確認し、製品の切り落としではないと切り分けた。

## 要件と変更

| ID | 維持・追加 | 受入条件 |
| --- | --- | --- |
| REQ-001 | 維持 | Document固定、横あふれなし、画像読込、Code幅、PC操作枠サイズ、操作Targetサイズ |
| REQ-002 | 更新 | 全本文の1画面収納を、設計済みScroll領域での本文末尾とPager到達へ変更 |
| REQ-003 | 追加 | 狭幅Pagerの2段配置・非重複・各44px以上、目次開閉後の次Slide操作を確認 |

製品コード・教材・画像baseline・Gate・依存関係は変更しない。Skipやsnapshot一括更新はない。新しい末尾境界の比較は、既存寸法検証と同じ1 CSS px（scrollTop整数丸め）で行い、画像比較閾値は変更しない。

## 実測と検証（2026-09-27）

Docker Chromiumの変更前11対象は8失敗・3成功。変更後は2ファイル全37ケースが34.4秒で成功した。Chapter 02の全16 SlideをPCと390pxで順に確認し、HTML/CSS・JS Exercise、低高さ・保存degraded、閲覧目次・次Slide、200%/400%相当reflowの既存回帰も含む。対象ESLint、Prettier、`tsc --noEmit`成功。

3つの末尾画像を目視し、同時に次を測定した。

| 画面 | Stage client/scrollHeight | Scroll所有者 | Pager bottom | Document client/scrollHeight |
| --- | --- | --- | --- | --- |
| HTML intro s01 1024×768 | 668 / 807 | Stage auto | 768 | 768 / 768 |
| JS ch02-l01-s03 1280×720 | 620 / 848 | Stage auto | 720 | 720 / 720 |
| Library intro s01 390×844 | 861 / 861 | Shell auto (844 / 1011) | 844.421875 | 844 / 844 |

最後の0.421875pxは整数scrollTopと小数レイアウトの差であり、末尾CTA本文の欠落はない。次Slideへの実クリックも成功。

実行は既存専用Dockerコンテナで`npm exec playwright test -- --project=chromium tests/e2e/responsive-layout.spec.ts tests/e2e/javascript-ch02-layout.spec.ts`（一時configでpreview先・結果保存先を分離）。製品ソースが一致するPR #36最終buildを再利用し、本差分による製品build変更はない。途中の新規テストはPager可視率100%の小数丸めとaria-labelの指定誤りで失敗・中止した。修正後の37件成功と区別する。

## 未検証・残る条件

この追補でFirefox/WebKit・実機・初心者試用・全公開Gateは実行していない。製品コード不変のため対象Chromium回帰に限定した。統合後の新main SHAで既存公開Gateを通してからβ公開し、Artifactと配信後操作を確認する。Run受付や通常CIだけで公開完了としない。
