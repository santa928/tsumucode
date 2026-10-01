# 型注釈1 Lessonの製品採点契約案

2026-09-29。Issue #11、`typescript-ch01-l02` の契約。型注釈試作11ケースから製品Validatorへ進めるための範囲であり、教材公開・Course全量確定ではない。同じPro Chatで4分17秒の設計回答を回収し、以下の境界を具体化して実装を開始した。製品コードの最終レビューは別途必要。

## 要件台帳

| ID      | 区分 | 受け入れ条件                                                                                                                                 |
| ------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | 維持 | 元TSの型検査、既存Analyzer、隔離Runner、元TS hashとsession/revisionの照合をすべて通す。型エラーは未実行・未採点。                            |
| REQ-002 | 追加 | Lesson限定の元TS構文条件として、トップレベルの単一変数scoreに明示的なnumber注釈があることを確認する。生成JSを型習得の根拠にしない。          |
| REQ-003 | 追加 | 信頼側の別ファイルで数値2の代入成功と文字列「2」の代入拒否を確認する。負例は指定code・file・位置の単一診断だけを成功とする。                 |
| REQ-004 | 追加 | any・型assertion・non-null assertion・診断抑制をこのLessonでは使用しない。コメント/文字列内の見かけだけを型構文と扱わない。                  |
| REQ-005 | 追加 | 元TSの最後の操作がconsole.log(score)であることと、実RunnerのConsoleが2であることをANDで確認する。表示固定・別変数・shadowingを合格させない。 |
| REQ-006 | 維持 | 最小正解、初期化後の代入、1へ1を足す別解を通す。型推論だけ・any・assertion・抑制・表示固定・union・値3は合格させない。                       |
| REQ-007 | 維持 | Worker期限/停止/世代破棄を維持。壊れた応答、環境異常、hash不一致を学習者の不正解として保存しない。                                           |
| REQ-008 | 維持 | 通常JavaScriptのSource Rule必須、Home初期chunkと既存公開Gateは変更しない。                                                                   |

既存要件の削除・保留はない。27 Lesson/595分、TypeScript新性能予算は既存の提案状態を維持する。以下はLesson専用構文範囲であり、TypeScript全般の言語制限にしない。

| 改訂対象    | 区分           | 差分                                                                                                                                       |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-002/006 | 維持・具体化   | 学習目標を満たすconst score:numberも認める。letだけに制限しない。                                                                          |
| REQ-003     | 維持・具体化   | 許可grammar通過後のコピーだけをmodule化。probeは非emit、非保存、非実行で原文hashに混ぜない。raw probe診断を学習画面へ返さない。            |
| REQ-004/007 | 維持・具体化   | grammar外・型要件未達はincomplete。上限・予約衝突・Worker/Compiler障害はsystem-error。実コメントの抑制とtriple-slash referenceも検出する。 |
| 全要件      | 保留・削除なし | 公開/初心者確認/既存Gateの要件を保持する。                                                                                                 |

## 任意コードへprobeを追加しない境界

型関係試作のexport追記を無制限に製品へ適用しない。このLessonの型判定は、単一のmain.tsで次の小さい構文範囲を確認してから行う案とする。

- 先頭に初期値を持つ単一のletまたはconst score宣言。宣言内の注釈は構文factとして評価する。
- 続く操作はscoreへの代入・複合代入・増減だけ。右辺は数値、score、括弧、数値の単項/算術演算に限定する。
- 最終操作は引数1つのconsole.log(score)。consoleの再定義・書換え、別のConsole操作は許さない。
- import/export、追加宣言、関数、ブロック、分岐、ループ、プロパティ参照、その他の呼出しはこの導入Lessonの対象外。課題内の案内にも扱う範囲を明記する。

この範囲なら別scopeのscore、途中でだけ実行される注釈、未実行のconsole.log(score)を合格根拠にせず、変数と実出力の対応を直接確認できる。演算子を特定の正解文字列と照合せず、上記の意味を保つ別解を認める。型の別名やinterface等は後続Lessonで別契約を設ける。

先に原文を通常compileする。型判定用コピーだけにexportを追加し、予約した別ファイルからtypeof scoreを参照する。原文のmodule/import/export等を排除済みであること、固定ファイル名と単一入力で衝突がないことを検査する。学習者の文字列からprobeコードを生成しない。probeやexport追記コピーはRunnerへ渡さず、実行は原文のcompile結果だけとする。

## 有限性と証拠の結合

型判定はCompilerと同じ信頼側Worker内で実施する。元TS構文の走査はノード/深さ/文字数に上限を置き、上限を超えた場合は採点不能として診断する。main threadへASTを渡さない。応答は既知の有限なboolean factと状態のみで、request/session/revisionとの一致、欠損・余分な項目・型違いを検証する。

製品Validatorは元TS hashを照合した同じコピーを再検証し、型条件と既存のDOM/Console動作条件を結合する。型Ruleがない古い基盤試験の動作互換性は維持するが、正式な型注釈Lessonには型Ruleと動作Ruleの両方を必須とする。型条件の未達は関連Hint付きの未達check、通信/実行基盤の失敗はsystem-errorとして区別する。

専用LessonのConsole Ruleは1件だけで、required=true、group=all、groupIdなし、viewportMode=all、equalsでlogの文字列2を1件だけ期待する。Course schemaと製品Validatorが同じ契約を検査し、期待値3・any結合・groupId・重複を採点前に拒否する。これはREQ-005の維持・具体化で、追加・保留・削除する要件はない。

## 最小検証と未確認事項

1. 既存11ケースを製品採点まで通し、表示が同じでも結果が異なることを確認する。
2. shadowing、Consoleの書換え、偽コメント文字列、予約ファイル衝突、過大/深い構文、偽Worker応答を境界テストで確認する。
3. 実Worker→Runner→Validatorで最小正解と別解の合格、表示固定と型注釈削除の未達を確認する。Unitの模擬Compilerだけを完了証拠にしない。
4. UIで型エラー→修正→判定→再編集による旧結果無効化と下書き保持を確認する。

元TS検査関数と非emitの型検査経路を実装した。文字数8192 UTF-16単位、AST2048ノード、深さ64を上限にし、許可grammarと型注釈・回避なしを通過した場合だけ正負probeを実行する。型要件のない推論/any/union等はprobe前に未達factとして返す。値3は型条件を満たすので、後段の実Console条件で未達にする。

Workerへ`compile`と専用profileの`learning-check`を分離した操作契約を追加した。結果は6個のbooleanと状態だけで、余分なpayload・不可能な組合せ・異なる操作を拒否し、従来の世代照合・停止・期限を維持する。型Ruleは単一・必須・all・groupIdなしで、専用Lesson/演習IDと必須Console Ruleが必要。専用Lessonで型Ruleを取り除くこともCourse schemaとValidatorで拒否する。旧TS動作fixtureの互換性は維持する。

製品Validatorは同じ元TSコピーの通常compile成功後に型checkを行い、動作結果とのANDで合否を返す。型要件未達はincomplete、環境障害はsystem-error。実Docker Chromiumで試作11例とconst別解の12例を実Worker→Runner→Validatorまで通し、最小正解/別解/constがpass、starter型エラーは非実行、残りはincompleteを確認した。値3は型checkがpass・Console条件がfail。表示固定や型推論だけは表示が2でも合格しない（1 test、40.8秒）。

Dockerのchecker21・compiler6・client15・Validator13件に加え、Course schema100件を確認した。型検査・対象Lint・content compile・production build・既存learning chunk検査も成功。既存10秒Worker期限は安全上限であり性能目標達成値ではない。実画面の結果案内/保存検証と最新HEAD独立レビューは別途記録する。全Course/全Browser/公開Gateは教材公開段階まで完了扱いにしない。初心者試用と実機確認、全教材のp95測定は別の受け入れ条件として残る。

改訂差分: REQ-001〜008は維持し、Worker/配信schema/製品採点への接続を具体化。削除・保留なし。受け入れ条件、非対象、リスク対策、性能目標を保持した。

実演習UIもDocker Chromium 1280×900で確認した。型注釈なしで出力2のコードは「あと一歩」と型注釈の修正案内を表示し、number注釈と加算へ直すと合格、再読込後も元TSとConsoleが復元された（16.1秒）。未達・復元後の2画像を目視し、案内・ヒント/見直し・下部操作の収まりを確認した。旧動作採点fixtureの型エラー非採点/履歴保持も成功。新テスト初回は結果dialogを閉じず編集しようとしてタイムアウトしたため、実UIの「閉じる」操作を追加して再検証した。製品の操作制限や合否条件は変更していない。
