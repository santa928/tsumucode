# 2026-10-02 独立レビュー後の統合受入

Pro Chatが会話長上限で使えないため、本人の2026-10-02指示に従い、独立したGPT-6.1 Sol / xhighの3担当で教材、Runtime、TS/React/Next作者用準備をレビューした。最新技術入力は`76679dd3ad64c939438f4d4f73e9928c961b4619`。承認台帳・この記録を含む最終PR HEADはPR上の独立レビュー記録とCIで固定する。

## 対象と保持する条件

PR60/61/62/63/64/65/66/67/68/69/70/71/72/79/80/81/82/83の18固定HEADを履歴保持で取り込む。作者branchの書換え・main直接pushは行わない。JSはCh07〜11の19 Lesson/330分を含む46 Lesson/184 Slide/48標準演習/760分のdraftである。

| 要件        | 改訂区分 | 結果・保持する境界                                                                                                                |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| REQ-SOL-001 | 維持     | 内容・コード・最新HEADを独立レビューし、重要指摘を解消して必要CI後に統合する                                                      |
| REQ-SOL-002 | 追加     | Promise/awaitの取得元が初回2件、再操作3件を返し、取得結果を捨てる固定表示は不合格にする。呼出しのソース形は結果利用の証明としない |
| REQ-SOL-003 | 追加     | 各開閉checkpointで操作名も比較する。有効なaria-labelledbyをaria-labelより優先し、空の有効参照と無効参照を区別する                 |
| REQ-SOL-004 | 追加     | TS Snapshot内の遅延診断を元TS位置へ写像し、世代チェックと未知mapの安全な扱いを保つ                                                |
| REQ-SOL-005 | 追加     | 判定が変わる3演習だけ旧合格を失効する。旧Draft全文は隔離recordと更新前バックアップに保ち、閲覧・他教材を保持する                  |
| REQ-SOL-006 | 維持     | 未許可通信・親画面・保存領域へのアクセスを禁止し、750ms観測上限、Home分離、既存性能予算と公開Gateを維持する                       |
| REQ-SOL-007 | 維持     | Guided/Capstone、人の初心者試用・物理端末・screen reader読み上げ・全Course正式公開をこの技術受入で代替しない                      |

保留・削除はない。`2026-09-28.19`→`2026-10-02.1`ではch10-l01/l02、ch11-l03のexerciseを理由付きintentionally-resetする。旧sourceは現在の編集画面から外れるが、退避データと復旧バックアップへ全文を保ち、進捗書き出しに含める。ファイル単位のUI復元は未提供であり、ワンクリック復元とは案内しない。

## 検証と独立レビュー

開発実行はすべてプロジェクトのDocker手順。実Bridgeと実JS移行の新回帰は修正前REDを確認し、修正後6ファイル80件が成功。TS診断mapとcheckpointの旧2回帰もRED→GREENを確認した。対象型/Lint、3Course Compile、JS出典1089件、Build/CSS inlineとlearning chunk分離が成功している。

変更3教材の実Runner/Validatorでは各Solution・Starter・正解別解・誤解FixtureをChromium/Firefox/WebKitで確認した（9 E2E test）。Promise/awaitの6件は入力不変の成功を再利用し、操作名の3件は新Fixture修正後に確認した。native編集→Preview→操作→Reset→別解→判定→保存→Reloadを同3Browserで確認（9 test）、Chromiumの390px Promise読書を1 testで確認した。計19 E2E testであり、全Course/全Viewport/物理端末を再実測した数ではない。

独立JS担当は、変更したSlide実フェンスを改変せず実Runnerで4例を確認した。producerとPromise表示の2→3件/空→草、awaitの2→3件、同期処理が先に進むConsole順序を確認した。rootのFixtureテストと独立掲載例の実測を別の証拠として扱う。

生成物は`8a7f0d7`でBuildし、後続変更は作者用Fixture宣言とFixtureコードだけ。3Lessonの生成JSONと配信dist JSONのbyte一致を確認したためBuildを再利用した。Vite manifest SHA-256は`a57c905b3522826d8d0329f0590e5b1404c36f816321c1ebd5caff35b10e2771`。専用Docker内/tmp mirror・4261を使用し、終了後に専用Preview停止と既存4216維持を確認した。

初回の準備失敗（tarのmacOS sidecar、欠けたChromium実体）、旧Fixtureフィードバックの不一致、新負例の禁止document.bodyは成功証拠に含めない。sidecarだけを専用mirrorから除去し、既存Dockerの同version有効cacheを専用tmpへ複製した。誤解Fixtureのstatusと採点条件を維持してcheckpoint全体のフィードバックへ同期し、許可済みquerySelector(main).appendで負例を構成した。Gate削除・sandbox開放・不正解を正解に変える期待値変更はない。

## Issue #8の受け入れ条件への対応

| 条件                                                       | 証拠と限界                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必要内容の直前説明/既習と少し変える課題                    | Ch07〜11原稿・Concept/Glossary/Hint/Fixtureの独立確認。新10Lessonの内容hash承認を台帳へ追加し、既存36Lessonと合わせる                                                     |
| DOM/Event/Form/State/async/Keyboard/Focus/Nameの実行と集計 | 各教材の既存固定PR実Runner/UI記録を再利用。変更3教材は上記新9Fixture testと掲載例で再確認。Course集計・screenBudget・出典をCompile/契約testで確認                         |
| 隔離と未許可通信禁止                                       | PR63/66/69の実装と既存境界証拠を独立確認。新Bridgeは名前の優先順位だけを修正し、新Scenarioは有限selector observationを再利用する。新しい能力・通信許可は追加しない        |
| 判定/Reset/再試行/結果鮮度、システム失敗の非採点保存       | 既存Runtime/Controller/Lease/診断の回帰・作者固定証拠と、新9 native UI test。TS Snapshot診断mapと旧合格移行の新実module回帰                                               |
| Keyboard-only、PC演習/狭幅読書                             | Ch11の既存native Enter/Space/Escape/Tab/focus記録を再利用し、変更後の実Esc→Tab→Enter/Spaceを3Browserで確認。PCと390pxの代表画像を実目視。実機/読み上げ/初心者理解は未確認 |
| Home/Path/読書の重い依存分離                               | learning chunk isolation成功。既存性能の絶対上限を維持。全性能/Lighthouseは新たに実行しておらず、公開時の既存Gateで確認する                                               |
| 未完成Courseを完成Pathに掲載しない                         | publicationStatus draftと限定pilot入口を維持。通常Pathへの完成版昇格は行わない                                                                                            |

上記の技術受入・最終HEAD独立レビュー・必要CI・main統合をすべて満たした後に#8を閉じる。closeは全JSコース完成や配信完了を意味しない。

## 未完のIssueと非対象

- #9: Guided 5Lesson/100分と累積workspace、保存/移行/判定・Keyboard/Focus・p95≤3000msの実証。
- #10: Capstone 1Lesson/150分、全52Lesson/14章/1000分、完全初心者の通し、全公開Gate、published昇格。
- #11/#12/#14: TypeScript/React/Next.jsの全Course。PR79はTS型消去の未登録原稿、80はQuestion shape作者用資料、82はProps作者用パイロット、83はNext作者用実サーバー実験。学習者用TSX/Next経路と全カリキュラムの完成ではない。
- #25: HTML/CSS ZIP持ち出しの技術実装と既存証拠を保持。常駐学習者環境のorigin/revision/storage/resource/idle等は未完。
- #5と人の初心者試用・実機・正式公開は継続。Python系列、任意Tailwind、新公開先・新費用・新秘密利用は追加しない。

最終保持チェック: 受け入れ条件は上表へ対応、非対象は維持、リスクは誤合格/旧保存/隔離/鮮度を検証、性能目標はHome分離・有限観測・既存上限と公開Gateを維持した。今回はmergeの受入であり、配信前のcheck:release・全Browser/性能/Lighthouse/公開URL操作Gateは実行していない。βを更新する際は最新main固定SHAで既存workflowを別途実行する。
