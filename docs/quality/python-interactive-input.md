# Pythonの実行途中の入力（#196 / #140）

## 接続する範囲

Local CPythonの既存の対話練習を維持し、Pyodideにも練習専用の入口を接続する。対話出力・待機・EOF・中止・環境障害は採点結果や進捗へ渡さない。「判定する」は従来の別実行で、対話入力を採点入力へ取り込まない。入力欄・生出力は今回の画面だけに置き、下書き・履歴・過去成功版・共有JSONへ追加しない。

Browserの対象は `input-echo-v1`、`age-branch-v1`、`range-loop-v1` の3profile。全Sourceを既存の同期AST検査に通す。属性参照・import・任意呼出し・関数定義・async・予約名の再代入を許可しない。module/OOP等の対話実行は今回広げない。Localの対応範囲は従来どおり。

## 方式と境界

固定Pyodide 314.0.7の `callPromising` とPythonの `run_sync` で同じPython stackを待機・再開する。Sourceの書換え、最初からの再実行、模擬的な成功は使わない。空文字列とEOFは別packetで渡し、EOF後は再要求しない。

Workerは既存と同じopaque frame、classic Worker、private MessagePort、固定core bytesとhash、CSP、global/prototypeからの能力除去とintrinsic固定を使う。SharedArrayBuffer、COOP/COEP、追加権限・公開先・通信先は導入しない。既存の通常採点用frameの期限も変更しない。

PyodideのPromise proxy初期化は能力除去より前に固定の無入力処理で済ませる。その後、能力除去済みの環境で固定 `input()` の待機・再開を自己検査する。API名の存在だけで対応とは表示しない。Firefoxは必要なAPIがなくcore取得前に未対応と表示する。今回のWebKitは内部timerを必要とし、既存の能力除去下では自己検査に失敗するため未対応を明示する。事前入力のプレビューと通常採点は維持する。

入力Promiseを作成した後、別taskからsequenceを照合して待機を通知する。上の3profileには独立した学習者callbackを作る構文がない。この制約とtask境界を合わせた方式であり、任意Pythonの停止証明ではない。作者用policy bypassで対話待機は許可しない。

信頼frameが計算累計1.5秒・待機累計60秒・全体61.5秒を管理する。待機へ移る直前にも計算残量を確認し、入力をWorkerへ解放する前に計算時計へ戻す。入力は16行・UTF-8で1 KiB、Consoleは既存の64 KiB・100行・1行4 KiB。run/session/revision/Source hashと要求sequenceを照合し、二重・別run・停止後・期限後の入力を拒否する。

中止はframeがWorkerをterminateし、portを閉じ、blob URLを破棄してから応答する。親もframeを破棄する。Source編集時のkey変更、画面離脱、書込権限の喪失でも練習を中止する。入力内容の履歴配列は作らず、親が持つ送信量は行数とbyte数だけ。

## 検証

`scripts/local/python-interactive-acceptance.mjs <chromium|firefox|webkit>` は1回につき1browserだけを実行し、実Worker・実Pyodide・実CSP・実能力除去で確認する。結果は `test-results/python-interactive/<browser>.json` にWorker hash、観測時刻、各シナリオの実snapshotを保存する。未対応の環境を対話成功へ数えない。

Chromiumでは、連続input・同じrunへの送信・空文字・EOF・二重/停止後入力の拒否・UTF-8 byte上限・16行とEOFの区別・中止後の新run・入力前後の長い計算の停止・出力上限・属性/import/aliasによる迂回拒否を実測した。構文エラーの診断と修正後の復旧も対象とする。Firefoxはcore取得0・frame作成0で未対応、WebKitは能力除去後の自己検査で未対応を確認する。

`pythonPracticeFrameSource.test.ts` は計算/待機の累計、期限切れ直後の送信、identity各fieldの不一致、二重と停止後の送信を決定的な時計で検証する。既存Local client/Panelの回帰も実行する。

`tests/e2e/python-interactive.spec.ts` は通常画面で実採点により作った進捗と過去成功版を基準に、対話中の入力・空行・EOF・中止・編集・離脱・復帰、保存/JSONへの非混入、keyboard focus、PC/390pxとaxeを確認する。Browserの全3engineとLocal CPython用設定へ登録する。未対応表示は成功した対話操作と別の証拠にする。

独立Runtime静読レビューでは、SyntaxErrorの誤分類と診断消失の指摘を修正し、未解決Blocking/Importantなしを確認した。AIペルソナによる通常UIの検証は実人の観察とは区別する。公開版への反映と確認、exact HEADとmerge SHAのCI結果はPRとIssueに記録してから完了を判断する。

## 実行環境の制約

最初の試作では専用containerのOOMとMacへの接続断が発生した。再接続後は残存processを専用containerだけ再起動して回収し、browserを1engineずつ実行する形に変更した。後のproduction buildでも、他タスクの検査とDocker VM全体のメモリ圧迫が重なり型検査がkillされた。これらの失敗を合格として扱わず、通常画面/build/CIは後続の成功した実行で確認する。

## 途中候補の確認と失敗履歴

アプリ側の分割型検査（heap768 MiB）、固定Python asset生成、Vite production build、inline CSSは成功。この途中候補のNode側の型検査は資源圧迫中に専用containerを回収したため未完だった。通常UIのDocker試験は、初回page準備timeoutと、その後の配布物root／試験URL `/repository-name/` の不一致による404で失敗した。後続では `BASE_PATH=/` を明示し、retries 0・1worker・1browserで同じ候補を確認する。

Dockerを停止後、Mac Chromeとlocalhost限定の静的配信で、通常画面の入力待機、1行送信、正常終了・未採点、開始ボタンへのfocus復帰を観測した。配信artifactは `test-results/input-artifact-identity.json` に固定した。画面上部に残っていた「実行中の追加入力は未対応」という案内はSourceで修正済みだが、この文言修正版の再build/再確認は未完。

未完の検証を実行済みとしない。READMEの `check:prepush` 契約に従い、cleanな最終commitで単一入口を通過するまでpush/PRへ進めない。Issueも公開・検証が揃うまでOPENを維持する。最終commitの検証結果はPR/Issueへ記録し、この途中候補の失敗履歴を成功記録へ書き換えない。

独立AIペルソナは、固定artifactの通常UIで対話待機・空欄・EOF・中止/再開を観測し、参照先のl02 Slide/手順書に残る「Browserは途中入力に未対応」という説明との矛盾をImportantとして指摘した。初回観測はその版のまま保存し、該当2文書を今回のSourceで修正した。この教材本文修正の再build・配信UI再確認と、本文指紋に結び付く教材review/公開証拠の更新は未完。ID・課題Source・Rule・Fixture・進捗形式は変更していない。既存の承認原本を今回の本文の承認へ付け替えない。

独立AIペルソナの観測報告は `test-results/persona-input196.md`。同じ固定artifactでSoraの表示、空行、EOF、中止→再実行、実採点成功、再読込後のコード・合格保持と入力非保持を確認した。通常実行の停止成立・複数input・上限/timeoutはこのペルソナの確認範囲外。これは実人の観察でも、説明修正版の再確認でもない。

2026-11-03の排他枠で、Lint修正後の対象25 Unit/Componentと実Chromiumの11シナリオを再検証し成功した。Firefoxはcore取得0で未対応、WebKitは能力除去後の自己検査で未対応。作者検証bundleのWorker SHA-256は `c45b94ee5e1c0ea3b33b3b2e8266862b04f67c0a8086c327cf7b19b353269f3a`。このhashは作者用build条件の証拠であり、後続のproduction配布物のhashへ読み替えない。最終の単一入口・通常UI・CI・公開結果はPR/Issueへ追記する。

公開前台帳l02は、新しい本文hash `2f3e5b80cdd3c0578a3b0aa5abc51de993bf4864032e2a324309ab5483b2e469` に差分レビューを結び付けた。変更したs01とinstructionsだけを独立AIが再静読し、残るImportantなし。Goal・例コード・Hint・Starter・Solution・Rule・Fixtureが不変であることをGit差分で確認し、それらの承認/例コード実行証拠は元の条件に限って再利用する。旧承認行は[旧レビュー原本](python-input-review-previous.md)へそのまま保存した。新しい本文のUI受入・実人の理解・公開承認とは区別する。

正規の `npm run content:review` では今回のl02のhash不一致は解消した。一方、base `16bbf554` から今回変更していない `python-basics-ch01-l03`・`python-basics-ch01-l09`・`python-basics-ch02-l01` の既存hash不一致で全体Gateは失敗する。この3Lessonの承認を今回の差分レビューへ付け替えず、並行教材作業との統合後の公開条件として維持する。通常の必須prepush/CIの成功を全体教材承認の成功とはしない。

通常UIのChromium試験は2026-11-03 11:54 UTC開始の実行で成功した（1 spec、91.8秒）。同じproduction配布物を1browser・1workerで検証し、検査に不要なVite開発serverだけを作者用一時configで省いた。通常入力・空行・EOF・中止・編集/離脱後の復旧、進捗/過去成功の保持、入力の非保存/JSON非混入、focus、390px表示とaxeを確認した。Source編集で現在passが失効する既存仕様は、練習だけで履歴が変わる問題と区別してassertする。axeが作る検査tabを閉じた後は対象tabへfocusを戻す。複数server構成での準備timeoutは成功記録に含めない。

Firefoxの通常UIでは対話未対応の表示を確認できたが、事前入力採点は既存の15秒初期化期限で失敗した。専用containerを2 CPUへ変更しても同じ失敗であり、通常採点の成功/公開条件には数えない。製品の期限や能力除去を緩めず、exact HEAD CI等で継続確認する。

WebKitの通常UIでは事前入力の実採点まで成功したが、その後の対話準備で期限内の未対応表示まで到達せず、UI試験は失敗した。製品が許す取得90秒＋初期化15秒を試験も待つよう修正した再検証中に、専用containerのoom_killが1から2へ増えたことを確認し、ブラウザ処理を回収した。作者用core検証での未対応結果を通常UIの合格へ読み替えない。Firefox/WebKitの通常画面の完了条件は未達として維持する。
