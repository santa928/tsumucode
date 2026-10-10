# Nextの9教材のAIペルソナレビュー

対象はIssue #132/#133の`next-ch01-l01`、`next-ch02-l01`、`next-ch02-l02`と、
Issue #134の`next-ch03-l01`、`next-ch03-l02`。
2026-10-08に、実装担当とは別の3つのAIエージェントが読み取り専用でレビューした。
実人の初心者による受講テストとは区別する。

| ペルソナ / Reviewer ID                         | 観点                                                                   | 方法                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Next初心者 / `next_learner_persona`            | TypeScript/React修了者が提示コードから予測し、診断と修復を理解できるか | Slide・工程・Hint・Solution・Fixtureの独立読解、作者の実行証拠の確認 |
| 教材編集者 / `next_learning_design_persona`    | 予測→実測→修復、説明と目標・採点の整合、答えの開示順                   | 同上、内容Review台帳の確認                                           |
| 運用・a11y担当 / `next_runtime_safety_persona` | Source・進捗の保持、固定URL・資源・認証境界、失敗回復、keyboard操作    | 実装と契約の独立読解、作者の実行証拠の確認                           |

## 指摘と対応

提示前のメッセージ値を予測させる問いを、提示コードから答えられる問いへ変更した。
12 Slideすべてで答えと理由を折り畳み、予測してから開示できるようにした。

Counter Starterを`use client`不足による実診断から始め、CounterだけをClientへ修復する
工程を追加した。pageのasync/Node処理をServerに残す理由を予測し、境界修復後に
初期値2、加算3→4、再読込2を確かめる。

`node:path`の文字列処理と`node:fs`のファイル操作を分け、固定dev環境とproduction
buildで診断が異なる場合を説明した。普通の関数propsのbuildは型検査で先に失敗するため、
その結果をdevの直列化診断と同一視しない。

ブラウザ受入ではリンク、URL選択、Counterをkeyboardで実操作する。
Slide切替は表示中のSlide IDを待ち、前のSlideを操作してしまう検証上の競合を除いた。
iframeから親Stageへ戻るときは既存の編集権再確認を待ってから採点する。
再確認中の保存・採点を拒否する保護は維持する。

## 確認範囲

固定Next 16.3.8の製品実採点APIで、旧Lesson6例・routing8例・境界9例を確認する。
初期境界エラー、詳細pageの500、修復後合格、Source再開、古いhash拒否を含む。
learnerはCPU1、PID64、tmpfs各64 MiB、network:noneを維持する。
RAM/MemorySwapはFirst/Clientが512 MiB、本人承認済みのRoutingと新2が576 MiBで、追加swapなし。
新2教材の承認済み576 MiB変更と追加受入は、下記Issue #134の追加確認に記す。

通常の製品画面で12 Slideの答え開閉、3 Lessonの編集・反映・採点、停止・再開、
keyboard操作、狭幅表示、axe検査と進捗/DraftのJSON移送を確認する。
旧Lesson・新2Lessonの画面受入とJSON移送は完了。12 Slideのkeyboard開閉、
3 Lessonのaxe違反0、両新LessonのDraft・合格記録のexport/import、管理token/run非含有を確認した。
独立Reviewerの確認はこれらの作者実行証拠に基づき、Reviewer独自実行とは扱わない。
具体的な原稿hashとLesson別結果は`content-review-next.yaml`に記録する。
生ログ・スクリーンショット・学習データは非公開の作者記録へ保管する。

## Issue #134の追加確認

新2 Lessonの8 Slide、工程、Hint、Solution、正負Fixtureを同じ3 AIペルソナが独立読解した。
再要求の操作を「対象→入口→対象」と具体化し、同じ選択肢を選ぶだけでは再要求しないことを説明した。
教材APIの404とstream済みpageの200を別のHTTP応答として説明した。
Weatherは待機中の結果非表示・完了後のstatus消失も判定し、常時statusを表示する負例を追加した。

固定APIを同じ隔離のbootstrapへ分離した512MiB試作で、Data8例・Weather9例、古いhash拒否、
停止時のSource保持と再起動が成功した。正式整理後の通常UIで編集・反映・合格、構文エラー修復、
合格版失効、停止/reload/再起動、keyboard、狭幅、axe違反0、両LessonのDraft・合格JSON移送を確認した。
実RSCの結果到着前にSource反映・停止を行い、部分応答の切断、旧版grade409、新版合格と再起動も確認した。
固定APIの版分離・未知query拒否・遅延応答破棄と転送契約の関連12テストが成功した。

3 Reviewerは作者の成功ログと通常/狭幅4画像の画像自体を照合し、必須修正0と判定した。
正負APIの試作証拠と正式UI/stream証拠を区別し、Reviewer独自実行や実人受講とは扱わない。
RAM/swap512MiBなどのlearner上限は維持し、768MiB案は採用していない。

反映時に旧Nextと追加Node processを重ねないよう、新2教材の反映前停止と
seal済みsocketでの固定HTTP確認を追加した。運用Reviewerが指摘したpause中の
旧marker再起動は、反映識別子と停止完了を照合するまで再開しない形に修正した。
実HTTP受入に同じSourceの再反映、pause後の並行ready拒否、停止・Source保持と
再起動を含める。原稿・UI・採点目標は変わらず、3 Reviewerの前回確認は継続適用する。

このレビューの対象は現在の5 Lessonである。Courseはdraftを維持する。
作者の資源計測を追加process不要の内部HTTPへ移し、OOM killも検査する。
採点基盤の固定段階だけを診断に返す変更は、503時のrun回収と次回清掃を維持した。
3 Reviewerはこの診断差分にも既存レビューを適用し、必須修正0と確認した。
正式公開には#135のForm/Action、#136のProject・独立復元・無Hintの転移課題、
#137のCourse全体の受入と公開手順の完了が必要であり、この記録で代替しない。

512 MiBでの作者連続成功後も、merge後mainのWeather負例がOOM終了した。
運用Reviewerは現構成を受入不可と判断し、Issue #134はOPEN、Courseはdraftを維持した。
2026-10-08の本人承認により、新2 WorkspaceだけRAM/MemorySwapを576 MiBへ変更する。
追加swapや他の境界、旧3教材の上限は変更しない。差分を3 Reviewerが独立読解し、
教材目標と前回の内容レビューを継続適用できること、必須修正0件を確認した。
安定性の最終判断は新しい連続実測と正確なHEAD・main CIがそろうまで保留する。

576 MiBの作者連続検証を3 Reviewerが読み取りで照合し、必須修正0件と判断した。
運用Reviewerの判断は条件付きGOであり、Data約61 MiB・Weather約51 MiBの観測余裕、
上限到達/OOMイベント0、終了後のコンテナ回収を根拠とする。最後の生存sampleが
Zombie1だったrunについて、削除前に0へ戻ったとは認定しない。全体の正式受入は
新しい上限到達/OOM拒否検査を含むexact HEADとmerge後mainのCI成功が条件となる。
Reviewerの独自実行ではなく、作者の生監視・成功ログ・画像との照合である。

最初の576 MiB候補のHEAD CIは、旧Client教材の負例で512 MiBのOOM終了を検出し、
新2教材へ到達する前に失敗した。旧3教材のRAMは増やさず、Next childのheapを
160 MiBへ限定し、資源計測とseal後の反映確認を追加Node不要の内部HTTPへ統一する。
新2教材のheap128 MiB、採点期限、目標、期待値、SourceとPreviewの境界は維持する。
最初のheap限定候補のHEAD CIでは旧Routingのmax=1を検出したため、
新2で使うallocator・並列処理設定と追加dev worker抑制を旧3にも適用した。
そのHEAD CIは全工程を通過したが、Routingのpeak511.99 MiB・余裕約12 KiBでは受入できず、
マージを保留した。反映前停止・反映識別子照合・生成物初期化を旧3にも適用する。
作者の旧23例は成功し、peak約411/401/460 MiB、max/oom/oomKillとZombieは0だった。
中間候補の定期監視では一時Zombie1も観測したが、この候補で全期間0を保証する意味にはしない。
正式受入にはこの修正を含むexact HEADとmerge後mainの成功が引き続き必要となる。

反映前停止後も旧RoutingのHEAD CIでmax=1が再発した。Routingのheapだけ128 MiBへ限定し、
他教材の実行条件を維持する。作者のRouting8例は成功したが、ARM環境のpeakは
160 MiB候補とほぼ同じで、CIの上限接近が解消した証拠にはしない。運用レビューは
必須修正0件、正式GO保留とし、新HEAD/mainの成功と実測余裕を確認する。

## Routingの追加承認と限定再検証

512 MiB候補はexact HEAD CIが成功しても余裕約2.49 MiBで、運用Reviewerが受入を保留した。
2026-10-09に本人がRoutingだけMemory/MemorySwap576 MiB（追加swapなし）を承認した。
First/Client512 MiB、新2の576 MiB、heapと他制約は維持する。
変更後のRouting8例・通常UI・反映/停止/再起動の作者連続検証は成功し、
Routing peak494.94 MiB・余裕81.06 MiB、max/oom/oomKill0、checkpoint Zombie0だった。
監視一時Zombie1と削除前最後の生存sample1を隠さず、終了後のlearner/grader0件を別に記録した。
教材の先行3ペルソナレビューは入力不変の範囲で継続適用し、今回の資源差分と新実測は
独立運用Reviewerが生ログを再集計し、必須修正0件・条件付きGOと判断した。
正式受入にはexact HEAD/main CIと実測余裕の確認を必要とする。

## 制作2教材と全9教材の統合レビュー（Issue136/137）

2026-10-09、`next136_learner_review`、`next136_learning_review`、
`next136_runtime_review`が独立して制作2教材と全9教材の公開準備を読解した。
レビューはAIによる査読と作者の実行証拠の照合で、Reviewerの独自実行や人間受講ではない。
親Issue14のCookie条件は、管理資格情報をPreviewへ提供しない境界の成功へ置き換えない。
Form/Actionは許可した固定実HTTPの範囲であり、認証・Cookie保存・外部サービスは未対応とする。

First/Client/Form/Actionは512 MiB、Routing/Data/Weatherは576 MiB、
Guided/Capstoneは本人承認の最大1,000,000,000bytes以内の896 MiBに固定する。
全てswap同値、CPU1/PID64/非root/readonly/network:none、既存readiness/採点期限を維持する。

制作2教材の23正負Fixture、3工程の部分達成・後工程破損・回復、実GET/異なる2詳細、
metadata/Image/読み順/Keyboard、通常Lessonの実ZIP17ファイル一致、未反映編集保持、
元Draft/Source分離、独立JSONの別Browser読み込み、停止/reload/restart、axe0と狭幅案内を確認した。
最新通常操作の監視137sampleは上限到達/OOM/kill/Zombie0、peak約639/636 MiBだった。
以前の起動中に一度Zombie1を観測した証拠は保持する。次sampleから同run終了まで0であり、
全瞬間のZombie0を保証するものではない。既存の完了checkpoint検査を維持した。

ZIPのみの別Docker production/root/subpath復元は、現在のSource・包装のbyte一致を
運用Reviewerが独立照合して再利用した。Native採点と別環境production復元は別の受入である。
JSON再読み込み時に内部goalが保存Schemaへ混入する問題を発見し、公開ValidationCheck項目だけの
明示変換と合格Snapshot/採点履歴を読み直す回帰検証により是正した。

全9教材の初心者reviewは初回のPreview選択案内の位置/label不一致を必須1件として指摘した。
現在の「表示する応答」と2つのJSON選択肢へ案内を修正した。学習設計は必須0件。
運用は実装必須0件だが、旧資源/期限文書、Nextの正式公開ゲートと静的Artifact検査適合を
公開準備の残件とした。既存5教材の証拠を全Course公開完了へ拡大しない。

Courseとレビュー台帳はdraftを維持する。全9教材の原稿hash・各実行証拠・3レビューを
最終候補へ結び、正確なHEAD/main CI、公開導線/Pages静的学習とLocal実操作のsmoke、
既存公開承認・Artifact/配信後の確認が揃うまで公開完了にしない。

## 公開導線とゲートの独立レビュー（Issue137）

2026-10-10、`next137_learner_publication_review`、
`next137_learning_publication_review`、`next137_runtime_publication_review`が
隔離ブランチの公開準備を読み取り専用で確認した。
初心者・学習設計は9教材の案内、PagesからLocalへのJSON移行手順、
Cookie・認証・Cookie保存未対応と親Issue14の留保を確認し、今回の本文修正の必須残件は0。
運用レビューで見つかった公開承認状態と原本照合bindingの欠落を修正し、再レビューで必須残件0。
これは原稿・実装の査読であり、Reviewerの独自Browser実行や実人受講の成功記録ではない。

公開品質記録はNext専用の9教材・9Workspace・81FixtureとPages静的学習を使用し、
既存React等のBrowserや性能記録をNextの成功へ差し替えない。
既存4コースの継続性と全site品質検査を維持し、公開直前にはPからProductが不変な
main SHAのLocal Runtime CI成功・必須step・資源証拠Artifactを公開APIで確認する。
独立原本照合の承認は、実際の原本を確認してから品質記録全体hashと対象SHAへ結ぶ。
最終の候補・CI・配信後の結果は`next-release-acceptance.yaml`、Release台帳、
revision別の公開後記録を正とする。人間受講と実低性能端末は未確認として残す。
