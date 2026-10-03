# Issue #92 / #93 教材評価の保持と静的検査の順序

## 要件と範囲

#92の原Issueにある全52/54×3 fresh再実施の維持は、2026-10-03 15:57 JSTの最新本人指示（Sentinel_f4b12686a5908191805fbcf3cd0269e1）で置換した。初回案の同一dist/hash＋test-only継続承認は採用しない。

| ID         | 区分 | 要件                                                                                            |
| ---------- | ---- | ----------------------------------------------------------------------------------------------- |
| REQ-092-01 | 変更 | 新規/未確認教材を3独立personaで一度評価し、確認済み教材と途中状態を保持する                     |
| REQ-092-02 | 維持 | 原Source/操作/report/checkpoint、独立性、未実施を埋めない、最終入口と公開後確認                 |
| REQ-092-03 | 変更 | 全体commit/hash/test/Runtime/容量変更を教材評価のリセット条件にしない。技術回帰は対象testへ分離 |
| REQ-092-04 | 削除 | 毎回全52/54×3 fresh完走、同一dist等の全体厳密一致を再利用の必須条件にする運用                   |
| REQ-093-01 | 変更 | Release production build直後にbundle/static artifact検査を配置する                              |
| REQ-093-02 | 維持 | 同一build、全Browser/性能/Lighthouse、失敗診断、Source/Artifact/Run binding、全閾値             |
| REQ-093-03 | 維持 | PR #91の承認済みEditor上限256,000 bytes                                                         |

今回の対応は別途依頼された検証効率の改善であり、進行中JS公開の新しい必須条件にしない。実施記録の運用と公開はJS担当、一般機構は本PRで扱う。教材修正、次コース開発、容量変更、dispatch/merge/deploy、汎用キャッシュ/多段承認は対象外。

## 実装

`JavascriptAgentLearningRecordSchema` v3の教材評価台帳をLesson/ペルソナ単位で蓄積する。以前の別commitの原Source/原Lesson hash/reportと本人checkpointを保持し、完了した読解/教材操作だけを済へ数える。可視教材の指紋は説明・課題・Starter・Hint・可視feedback・参照用語・図版bytesを教材単位で含み、Runtime/採点内部/全体revision/設定/配信容量と結合しない。実教材内容が変わった場合も対象教材だけ未確認にする。旧schemaや部分reportの存在を理由に再学習せず、実施済み行を原証拠から整理する。

`release:learning-coverage -- --record <台帳>` はdraft/部分台帳のconfirmedLessonIds/pendingを読み取り報告し、実績や承認を生成しない。独立原本review・最終5入口smokeを保持する。現候補のSource/Artifact/inputValidity/履歴bindingは公開入力監査へ分離し、過去の教材評価を最終SHAへ付け替えない。[runbook](javascript-agent-learning-runbook.md)と[通常公開基準](javascript-normal-release-policy.md)を同期した。

Pagesのquality jobは`check:release`内の既存build直後に`test:bundle`、`release:check`を実行し、成功後だけBrowser E2E、`test:performance:browser`、Lighthouseへ進む。全Gate末尾のhash/export/承認binding/成功Evidenceとfailure診断は保持する。ローカルの`test:performance`も`test:bundle && test:performance:browser`で早期失敗する。

## 代表測定と検証

変更前の失敗例は[Issue #93](https://github.com/santa928/tsumucode/issues/93)に固定された[Actions job](https://github.com/santa928/tsumucode/actions/runs/37093459275/job/111118750211)。E2E 27.5分＋操作性能2.6分の成功後にbundle検査1.97秒で失敗した。これは実CI測定で、将来Runの時間保証ではない。

2026-10-03、専用のport/networkなしDockerで`BASE_PATH=/tsumucode/`のproduction buildを一度生成した。既存JS学習コンテナ/依存ボリュームへ書き込まず、依存は読み取り専用の共有volumeから別匿名volumeへコピーした。

| 条件                                           | 結果                               | 実測wall time |
| ---------------------------------------------- | ---------------------------------- | ------------- |
| 故意の空Vite manifest + `test:performance`     | exit 1、Browser性能command開始なし | 2.382秒       |
| 故意の開発URLを含むStatic Artifact             | exit 1、開発URLを拒否              | 0.525秒       |
| 原bytesへ復元した同一buildのbundle             | 9/9成功                            | 2.582秒       |
| 原bytesへ復元した同一buildのJS Static Artifact | 328 files成功                      | 1.047秒       |

負例はfinallyで原manifest bytesへ復元し、故意の追加Assetは削除した。既存Home増分の警告21,327 > 20,480 bytesは警告として保持し、絶対上限179,389 / 256,000 bytesは成功。閾値を変更していない。

教材評価の対象Unitは、別Source/保存状態の確認済み再利用、新教材だけの残件、部分記録、対象教材内容の変更、独立性/原本/未実施/最終入口の負例を確認する。可視教材指紋はRuntime/採点内部の変更、説明/課題/Hint/feedback/図版bytesの変更を区別する。Pages契約は静的2Gateが全Browserより前でfail-closed、再buildなし、従来の公開binding/失敗診断が残ることを確認する。

最終対象検証: 6 files / 115 tests成功（learning-evidence、lesson-evaluation、pages-workflow、release-contract、release-boundary、static-artifact）。変更面ESLint・TypeScript build・Production build成功。教材の追加で前教材の次リンク/保存workspaceが変わる場合も、既存の教材評価は保持する。空draft専用fixtureの残件CLIは済0 / 未確認52、各3persona不足を返し、未実施を補完しなかった。これはUnit用fixtureの検証で、実教材の確認済み件数ではない。

GPT-6.1 Sol / highの独立差分reviewを実施し、操作証拠の転用、smoke自己review、採点内部参照の指紋混入を補強した。原report/checkpoint/可視教材原本の独立照合を維持し、再reviewでblockingなし。実施原本の整理・実際の済/未済確定と公開運用は既存JS担当へ引き継ぐ。

全品質の合格Runは本PRではdispatchしない。対象テストの成功を全Browser/全persona実学習・公開成功へ読み替えない。合格候補の全Gate所要時間は統合後の次の明示公開Runで記録する。
