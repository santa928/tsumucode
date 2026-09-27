# 実行とDOM表示の境界（Issue #27）

設計正本は [#20](https://github.com/santa928/tsumucode/issues/20)、実装範囲は [#27](https://github.com/santa928/tsumucode/issues/27)。2026-09-27の本文・コメントを確認した。

以下は#27時点の記録。後続の実Console経路は[Local Node（#28）](local-node-runtime.md)と[Browser Console（#29）](browser-console-runtime.md)を参照する。#27時点の「変数添字を拒否」「DOM観測を要求」は、#29で選ぶClosureのConsole専用経路には適用しない。その他のDOM経路の制約は維持する。

## 要件台帳

| ID      | 区分 | 受け入れ条件                                                                                                                                    |
| ------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | 追加 | HTML/CSS導入とjavascript-ch03-l05-e01を新しい実行入口から実行・採点する。console専用の実行portはiframe・偽snapshotを要求しない                  |
| REQ-002 | 追加 | 接続済みBrowser環境と未対応理由を表示し、安全制限の拒否を維持する                                                                               |
| REQ-003 | 追加 | run ID・session・revision・backend・engineを照合する。新操作・停止・Reset・離脱で旧結果を失効させ、未対応・制限停止・障害を判定履歴へ保存しない |
| REQ-004 | 追加 | Dockerで変更関連検証と対象2演習の代表Browser操作を行い、実施証拠と未検証をPRに記録する                                                          |

初版からの要件改訂なし。教材ID、CourseProgress、下書き、Import/Export契約を維持する。保留・削除なし。

## 採用する最小境界

- `ExecutionService`はexecute・stop・dispose、環境記述、実行結果を持つ。DOMを持つサービスだけが`dom`（prepare・snapshot・interaction）を提供する。
- `RunnerAdapter`は既存Browser実装の移行用契約として残す。遅延読込される`EditableExercisePage`で、`RunnerRegistry.create()`の検査済みAdapterを薄い`BrowserExecutionService`で包み、Controllerへ渡す。Homeで共有するRegistryは実行本体を読み込まない。既存Adapterの隔離・認証・復旧を再実装しない。
- 言語IDとは別にbackend、engine、実行形態、console／dom能力を記述する。既存Browser Runnerはiframeを使うためmode=dom。Consoleが主出力のClosureもNode実行とは表示しない。必要出力能力は既存runtimeのprimaryOutputから導出し、新しい教材metadataは追加しない。
- 新しい実行結果はsucceeded／code-error／unsupported／stopped／system-error。成功終了後にのみ採点材料を集める。構文・参照・安全拒否のcode-errorは既存のコード診断へ渡すが、未対応・停止・システム障害では採点・履歴保存前に止める。Validator自体のsystem-errorも保存しない。
- run IDはController instanceを区別する名前空間と実行連番で生成し、同じsource revisionの再実行も区別する。旧Browser通信のsession・revision・frame generation・認証検証は維持する。Controllerの操作世代で採点待機中の旧応答も破棄する。
- Resetと離脱は処理の終了を待つ前に失効させる。ResetはRunnerの`stop()`で旧実行・iframe・通信・教材資源を解放し、JS解析器は再利用用に保持する。次の実行は同じframeを再準備する。離脱の`dispose()`は解析器を含む全資源を最終破棄し、Runnerを再利用しない。今後の環境交換は旧Controllerのdisposeと新Controllerの生成で行う。環境切替UIはまだ提供しない。
- 初期化中に離脱した画面や失効したControllerの処理は、成功・失敗とも通知とUIを更新しない。現在の画面の実際の読込失敗は従来どおり通知し、再試行できる。
- 実行状態は非永続。保存済み合格snapshotと採点履歴を保持し、失敗時のConsoleは「前回成功時」と表示する。編集による既存の進捗鮮度判定は維持する。

## 解析と安全性

Acornによる構文解析、`assertJavaScriptCapabilityPolicy`によるBrowser安全制限、`collectFacts`による教材目標用の事実抽出を別の処理として維持する。環境依存の拒否はunsupportedへ分類し、今後別実行先を作る際にもBrowser policyをJavaScript文法そのものとして扱わない。

変数添字、未対応constructor、currentTarget、Profile外のmodule／async／DOM機能などは拒否を続け、環境制約と説明する。外部通信・Storage・親画面・動的実行などはsecurityを維持する。CSP、opaque iframe、認証、AST policy、budget制限は削除しない。診断分類は標準JSの全面対応や安全性の新たな保証を意味しない。

## 非対象・残る制限

#28のNodeサーバー、#29のBrowser方式刷新、Python／Next／PTY、全教材改訂、公開・mergeは対象外。localhost API探索や依存追加はない。console専用実行portはtest adapterで確認し、製品へ偽Runnerは登録しない。既存の教材ValidatorはBrowserのDOM観測契約を維持するため、DOMのない環境でその採点を要求すると明示的に拒否する。実Nodeとconsole採点の接続は#28で実証する。

## 検証方針・保持チェック

- [x] 受け入れ条件: 指定2演習、結果鮮度、拒否分類、履歴・下書き保護を対象にする。
- [x] 非対象: 上記範囲を維持し、次Issueへ進まない。
- [x] リスクと対策: 旧結果の誤採用は世代・identity、環境障害の誤保存は採点前停止、安全境界の退行は既存拒否系testで検出する。
- [x] 性能目標: READMEのPreview／採点／lazy chunk予算を変更しない。全コース・全Browser・Lighthouseを本PRの追加目標にしない。

実際の実行コマンド・結果・未検証範囲はPRに記載する。対象外の実Node・端末実機・公開URL・性能実測を検証済みとは扱わない。
