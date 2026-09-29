# TypeScript型検査境界（Issue #11、技術実証）

2026-09-29。今回の本人指定到達点はTypeScript・React・Next.jsまで。JSの学習前提を保持し、未統合教材の独立レビューと並行して、#11の技術検証を進める。Course完成・公開を意味しない。

## 要件台帳

| ID         | 区分 | 要件・今回の扱い                                                                                                            |
| ---------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| REQ-TS-001 | 維持 | #11の型用語・JS作品の型安全化、#12 React、#14 Next.jsの学習目標を保持。教材順序の確定と全教材制作は後続                     |
| REQ-TS-002 | 追加 | 既存固定TypeScript 6.0.3のProgramで構文・意味診断後にemit。型エラー時にJSを返さない                                         |
| REQ-TS-003 | 追加 | .ts相対path最大16ファイル、合計131072 UTF-16 code unit。信頼側から同versionの標準libを渡し、CompilerHostは仮想Mapだけを参照 |
| REQ-TS-004 | 維持 | 型エラー、構文エラー、環境エラー、実行時エラーを区別。入力Sourceを変更せず、修正後に再試行可能                              |
| REQ-TS-005 | 維持 | Compilerは初期Home/Path/Slideへ入れない。今回のmoduleは製品から未接続。後続で遅延Worker・停止/期限・revision照合を導入      |
| REQ-TS-006 | 維持 | 変換JSにも既存Analyzer/Runnerの隔離と拒否条件を適用する。型検査成功を安全な実行や教材合格とみなさない                       |
| REQ-TS-007 | 維持 | 初心者観察・既存公開Gate・独立レビューが揃うまでpublished/Path追加をしない                                                  |

保留・削除する既存学習目標はない。今回は同期compiler核の技術実証のみで、Worker配信、採点/保存への接続、教材、React TSX、常駐Next.jsは未実装の後続作業。

## 契約と非対象

`compileTypeScript`は文字列Mapを受け、成功時だけESNext moduleのJS Mapを返す。診断は元TSの1始まりのfile/line/columnとplain text（最大50件、1件2000文字）。標準libは学習者入力とは別の信頼側引数。ホストファイル、Node型、npm型の暗黙探索、任意compiler optionは使わない。型定義や.tsxの学習者入力はこの段階では対象外。

コードの実行は一切しない。無限Loopでも型検査は成功し得る。型assertion・any・TypeScript診断抑制の教材上の扱いは、型検査成功だけで採点せず、後続の課題契約で定義する。標準libを渡す責務は信頼側にあり、この関数自体を未検証の外部メッセージへ直接公開しない。

## リスク・性能・受け入れ証拠

入力数/サイズ上限だけでは型計算時間を制限できない。UI接続前に専用Workerを使い、期限超過時にterminate、古いrevisionの応答を破棄することが必須。今回の同期関数をUI main threadで動かしてはならない。Worker初回loadと型検査の実測予算は後続で設定し、現時点で達成済みと主張しない。既存Home chunk予算は維持する。

関連テストは実compilerと同versionの標準libを使用し、跨file型不一致→修正→JS生成、DOM/unknown/generic、構文/環境障害、外部import拒否、コード非実行、入力境界を確認する。Browser表示、TS診断クリック、停止、保存、Source map、性能は未確認。

2026-09-29検証: プロジェクトの既存Composeコンテナ内の一時複写で対象Vitest 6件、`npm run typecheck`、対象ESLint成功。標準libの一部欠落も環境エラーとして確認した。初回Lintはテスト名生成の数値文字列化1件を修正して再成功。製品から未参照のためBrowser/全suite/公開Gateは今回未実行で、Worker・製品接続または公開前に対応する検証を追加する。受け入れ条件・非対象・リスクと対策・性能目標の保持を確認した。

公式参照: [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)。Programの診断とemitを使い、transpileModuleだけを型検査と呼ばない。将来version更新時はAPI互換と教材診断を再検証する。
