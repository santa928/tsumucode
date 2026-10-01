# 型推論1 Lessonの採点契約

Issue #11、`typescript-ch01-l01-e01`。01-02の明示注釈と区別して、数値の初期値から推論された型を保つ練習を採点する。通常教材とCourse登録は別工程で、今回のfixtureを公開教材と扱わない。

## 要件台帳

| ID      | 区分 | 受け入れ条件                                                                                                                                       |
| ------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | 維持 | 元TSの通常compile、安全解析、隔離Runner、hashとsession/revision照合を通す。型エラーは非実行・非採点。                                              |
| REQ-002 | 追加 | 01-01専用profileは単一のlet score宣言に型注釈がなく、数値初期値を持つことを元TSで確認する。                                                        |
| REQ-003 | 維持 | 有限grammar通過後だけ元TSコピーに固定exportを付け、別ファイルの数値2受入・文字列2拒否を非emitで検証する。負例のcode/file/行/列まで一致を要求する。 |
| REQ-004 | 維持 | any/assertion/non-null assertion/診断抑制/reference/出力固定は未達。予約衝突・文字数/深さ/ノード上限・Compiler障害はsystem-error。                 |
| REQ-005 | 追加 | 01-01の専用profile・専用fact guardをWorker、Client、Course schema、Validatorへ接続する。01-02のprofileや応答と混同しない。                         |
| REQ-006 | 維持 | 型Ruleは単一必須all、Consoleは独立したexact log 2。型判定と動作判定をANDで結合する。値3の型条件が通っても合格にはしない。                          |
| REQ-007 | 維持 | 01-02のnumber注釈、const別解、既存の診断・世代・期限・保存境界を保持する。                                                                         |

改訂差分: 上記の追加は01-01の専用契約のみ。既存の型注釈要件・人の受入・公開Gateに削除/保留はない。

## 練習範囲とリスク

01-01はletの数値からnumberへの推論と再代入を扱う。明示number注釈は有効なTypeScriptだが、推論を練習する今回は未達にする。constのリテラル型の導入は今回に混ぜず、letだけを採点範囲にする。この制約は教材の課題説明にも明記する必要がある。TypeScript全般でconstや注釈を禁止する意味ではない。01-02では引き続きconst score:numberを認める。

共有するのは2つの導入Lessonの有限grammar・非emit probe実装だけ。結果型は注釈のexplicitNumberAnnotationと推論のunannotatedLetDeclarationを分ける。通信guardは余分なfactや成立しないprobe成功を拒否する。元TS、probe、生成JSを取り違えず、probeは実行・保存・学習画面への診断表示をしない。

制限は元TS8192 UTF-16単位、AST2048ノード、深さ64、既存Worker10秒のまま。10秒は停止上限であり、学習待ち時間の性能目標達成を意味しない。全27Lesson/595分や新たなp95予算は未確定の既存提案として残す。

## 検証と未完了

新checkerの導入前は未実装moduleによりテスト失敗。実装後、実Compilerの推論11件と既存注釈23件が成功した。通信・Validator接続前に新3件の失敗を確認し、接続後に既存を含む35件が成功した。Course schemaの101件も成功。模擬portのUnitは故障境界の証拠であり、実Worker/Runner/UIの代わりにはしない。

Docker内のChromiumでは実Worker/Runner/Validatorを通した注釈12件・推論11件の製品採点fixtureと、両profileの学習未達→修正→合格→元TS保存復元の計4テストが成功した。1280×900の推論未達パネルと修正後画面も目視し、課題のlet限定と結果案内が一致することを確認した。typecheckと変更コードのESLintも成功した。

最新HEAD独立レビューはPRで別途記録する。通常01-01教材、01-01→01-02のCourse連続遷移、初心者試用、実機、正式公開は未完了。公開教材を変更していないため、全Browser/全性能/Release Gateは今回実行せず、Course登録・β公開前に必要範囲を確認する。

- [x] 受け入れ条件を型・動作・通信の境界に分けた。
- [x] 非対象は通常教材/Course登録/公開と任意TypeScript構文。
- [x] リスクと対策はprofile取り違え・回避・probe露出・時間上限について保持した。
- [x] 性能の停止上限と未測定のp95目標を区別した。
