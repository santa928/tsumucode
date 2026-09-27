# #24 Home導線の公開Gate追補

## 原因と対応

[βRun36337683266](https://github.com/santa928/tsumucode/actions/runs/36337683266) はSource `669b7228e56dac473d17d2a2665cc0b24da1496c` のE2Eで249成功・3失敗となり、deploy/reportを実行していない。診断Artifact `10937579283` のSource identityと生ログを照合し、390×844・1280×720の失敗画像を目視した。

PR #40でHomeの先頭を「今回の学習」へ変更した後も、旧テストはh2先頭2件をPath/Courseと期待し、`data-path-primary-action`を初期画面の主導線として測定していた。実際には、新CTAは初期画面内にあり、Pathは下の棚にある。Path CTAのbottomは390pxで1259.125、1280pxで1007.96875だった。Dockerの同一製品treeでも同じ3失敗を再現した。

| 要件                                         | 区分 | 対応                                                                                    |
| -------------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| REQ-001 Homeの主要操作を初期画面で利用できる | 維持 | PCは「見出しと背景色を変えてみる」、390pxは「解説を読む」をscroll前に検査               |
| REQ-002 自由選択のPathとCourseを残す         | 維持 | 見出し順を今回の学習→Path→Courseへ同期し、Pathのscroll到達・クリック・実Slide描画を確認 |
| REQ-003 表示・通信・公開条件を弱めない       | 維持 | 0.5px許容、44px寸法、hit target、enabled、Course Manifest先読み0、既存公開Gateを維持    |
| 測定対象と見出しの期待値                     | 変更 | 承認済みHome仕様に合わせる。製品の表示・教材・保存を変更しない                          |

要件の保留・削除なし。初期CTAまでscrollして通す変更、閾値緩和、skip、snapshot更新はしない。既存Path画面の検査はそのまま残す。

## 検証

- 修正前: Docker本番previewで失敗した3件を再実行し、3件とも失敗を再現。
- 修正後: `BASE_PATH=/ TEST_BASE_SHA=669b7228e56dac473d17d2a2665cc0b24da1496c npm run check` をComposeで実行。教材compile・Lint・型・build・CSS inline・chunk分離成功。変更がE2Eのみのため、Vitestは関連Unitなしで終了し、Unit実行成功とは数えない。
- Docker本番previewのChromiumで、修正3件＋既存Home操作・文字100/200%・Path2viewport・Home→誤答→見直し→修正合格→次Lesson→Home再開を実行し、関連10件が16.5秒で成功。390×844と1280×720の初期CTA、scroll後Pathの4画像を目視。
- 変更3ファイルにPrettierを適用。実行ログはPRの検証欄で同じ結果と対応させる。

## 未確認と残る制限

- 本追補だけでβ公開完了とはしない。修復PRの独立レビュー・CI・統合後main CIを経て、新SHAの既存公開Gateと配信後確認が必要。
- 製品の見た目はPR #40から不変。全画面Visual、全Course×全Browserは局所修復の検証として再実行しない。
- 初心者による試用、iPhone実機は未実施。#24/#7の人手観察条件はOpenを維持する。
