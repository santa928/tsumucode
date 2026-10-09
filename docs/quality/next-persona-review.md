# Nextの5 LessonのAIペルソナレビュー

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
旧3教材のlearnerはCPU1、RAM/swap512 MiB、PID64、tmpfs各64 MiB、network:noneを維持する。
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
作者の旧23 Fixture連続実行は成功し、上限到達/OOMとZombieは0だった。
3 Reviewerは最終差分と作者証拠を照合し、必須修正0件と確認した。
内部並列制限を広げる前のRoutingのpeakは定期監視と採点直後の最大値を合わせ、
約474 MiB・余裕約38 MiBとした。その候補のHEAD CIでは旧Routingのmax=1を検出したため、
新2で使うallocator・並列処理設定と追加dev worker抑制を旧3にも適用した。
同じ旧23例が成功し、最終候補のpeakは約418/402/459 MiB、max/oom/oomKillは0だった。
監視中のRoutingの一時Zombie1は全runの最後のsampleでは0となり、終了後のコンテナも0件だった。
正式受入にはこの修正を含むexact HEADとmerge後mainの成功が引き続き必要となる。
