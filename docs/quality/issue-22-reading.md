# Issue #22 読書の続き・通読・演習引き継ぎ

基準main: `6f6a42b82ca3d03aeeae1022f0af993fb13d748b`。#21の3Lessonを使い、#26 Cの有限試用導線と合わせる。通常Libraryのpublished条件を緩めない。同じPro Chatで設計を確認し、通読・1枚表示・位置保存・演習URL引き継ぎへ接続した。実装の最新HEADレビューとCIは別に記録する。

## 要件台帳（初版）

| ID      | 状態 | 要件と受入                                                                                     |
| ------- | ---- | ---------------------------------------------------------------------------------------------- |
| REQ-001 | 維持 | 既存Slide URL・教材著者順・用語と通常Libraryを維持。進捗/下書き/PCの再開位置は更新しない       |
| REQ-002 | 追加 | Lesson本文を同じBlockから通読でき、1枚ずつの表示も残す。別教材本文を複製しない                 |
| REQ-003 | 追加 | 同じorigin専用のCourse/Lesson/Slide IDと表示modeで続きへ戻る。保存拒否は読書を止めない         |
| REQ-004 | 追加 | 不明な教材IDや所属不整合は近い目次へ案内し、別Lessonとして表示しない                           |
| REQ-005 | 追加 | 対応する演習URLと「あとで試す」を提供。自動同期なし、Pages/Localの保存originが別であると明記   |
| REQ-006 | 追加 | HTML導入/JS導入/Closureだけの試用目次。draft JS全体のpublished化や未完成Lessonへの誘導はしない |
| REQ-007 | 維持 | 読書初期取得へEditor/Runner/Pyodide等を混入させない。既存容量・chunk条件を維持                 |
| REQ-008 | 追加 | 代表狭幅と文字拡大で本文・コード・結果・目次・移動を実測。物理iPhoneや初心者観察とは区別       |

初版からREQ-001〜008をすべて維持。保留・削除はなし。以下の設計は同じPro Chatの相談結果を反映した。未実施を充足扱いにはしない。

## 表示と再開

通常LibraryのLessonに `/library/:courseId/lessons/:lessonId/read` を追加。通読は通常Document、1枚表示は既存固定Viewportのままとする。共通SlideStage/Blockを用い、Lesson見出しh1・section見出しh2・内部h3/h4とし、practiceのDOM IDはインスタンスごとに分ける。

`/library/pilot` はHTML導入・JavaScript導入・ClosureのCourse/Lesson組だけを許可する。目次・前後移動・本文取得を同じ集合へ限定し、通常Libraryの隣接Lesson先読みを起動しない。draft Course全体の掲載条件は変えない。

明示URLのSlideを優先し、保存位置は目次の「読書の続きから」を選んだときだけ使う。復元後にscroll/resizeを監視し、画面上部20%を通過した最後のsection IDが変わったときだけ保存する。長いsectionでも安定させ、requestAnimationFrameの予約とlistenerは離脱時に取り消す。試用/通常のscopeも分離する。未知IDはoutlineで照合して近い目次へ案内する。

操作欄も初期レイアウトへ含めてから位置を復元する。操作欄の描画と位置保存の有効化は分け、復元完了前には書き込まない。短い末尾sectionで復元後にDocumentの高さが増え、前のsectionを保存してしまう競合を防ぐ。

読書位置とPC演習のURLを分け、Clipboard拒否時も選択できるURLを表示する。PagesとLocalのoriginを書き換えず、進捗やコードの自動同期を表示しない。取得済みLessonは通信断でも読め、未取得Lessonの通信失敗は既存Error画面から再試行する。

## 非対象

Cloud同期・アカウント・スマホの本格Editor・PWA・全教材offline・検索基盤・新しい実行環境。手動観察や実機を合成テストで代替しない。

## 保存と失敗時の方針

読書専用localStorageキー `tsumucode-reading-v1` に教材ID・scope・mode・あとで試すIDだけを保存する。位置と印は各100件まで。既存IndexedDBや進捗APIを使わない。IDの形は保存読込で確認し、実在と所属は教材outlineで照合してからリンク/再開に使う。読込・書込拒否や壊れたJSONは読書自体の失敗にせず、その端末のしおりを利用できない/復元できない旨だけを案内する。保存できた場合も学習の理解・合格・端末間同期の証拠とはしない。印は既存Import/Exportへ追加しない。

## 現在の最小検証

- Docker既存browser container、Chromium、dev4192で `reading-mode.spec.ts` 6件と `slide-library.spec.ts` 3件成功。再開/URL優先/旧ID/範囲外/保存拒否/Clipboard拒否/有限先読み/通信断再試行を確認。通常学習の保存済みSnapshotを前後比較し、進捗・下書き・再開位置が同一。Library初期化のIDB openは0、Storage書込は専用キーだけ。
- 同じ本番buildのpreview4192でも上記9件が6.2秒で成功。開発serverでの結果だけを公開時の証拠にしていない。
- 390×844、root文字サイズ200%で3Lessonの目次・末尾・URL欄・重複ID・Document横はみ出しなしを確認。コード右端への内部scrollも実測し、画像を目視。文字拡大でヘッダーリンクが右へ出たため、Libraryヘッダーだけ折り返す修正を実施。最初の失敗を成功扱いにしない。修正後9件成功、画像追加後の同対象1件も成功。
- 証拠画像は [evidence/issue-22](evidence/issue-22)。既存画像比較のbaseline更新や閾値緩和は行っていない。
- Docker Composeで `TEST_BASE_SHA=6f6a42b… npm run check` 成功。教材compile、78Lesson承認/stale 0、Lint、変更関連13ファイル86件、型/build、CSS inline、実行chunk分離が成功。続いて `npx vitest run --config vitest.bundle.config.ts` の既存容量9件成功。依存・閾値・公開Gateは変更なし。最新HEADレビュー・CIはPRへ記載する。
- 未実施: 物理iPhone/実Safari、実初心者の理解観察、複数端末の実共有、全コース全Browser。Chromiumの390px/文字拡大は実機の代替証明ではない。アプリを閉じた後の全教材offlineは非対象。Storageの保持期間はブラウザ設定に依存する。

## 受入と残る制限

PR #39の独立レビューで、短い最終sectionの復元順序と通常Libraryの既存回帰確認が指摘された。実教材 `html-css-ch00-l01-s04` の明示URLで、修正前は共有URLがs03へ変わることをDocker Chromiumで再現。操作欄を先に配置し保存だけを復元後へ遅らせ、保存ID・共有URL・目次からの再開先がs04を維持する回帰を追加した。固定時間待機は使っていない。

通常Libraryは追加した読書操作が本文の下にあるため、従来の「最下端で本文末尾が見える」という検証がPC/390/412幅で失敗した。本文末尾・読書操作・Pagerをそれぞれ到達確認する形へ同期し、Document固定・横幅・操作サイズ・目次・次Slide実操作と1px許容を維持した。通常学習Slideの契約は変更していない。

追加修正のDocker検証は `TEST_BASE_SHA=a342aa9553e621a6d5b8cb30fc586a707c0f027b npm run check` で関連4ファイル52件、Lint、型/build、CSS inline、chunk分離が成功。本番previewの読書・通常Library・関連responsive 17件と、選択条件から漏れた有限pilot往復1件を別途実行し、計18件成功した。前段のdev関連5件も成功。全Browser・実機・初心者観察は追加実施していない。公開Gateは統合後に別途実行する。

- [x] 受入条件・非対象はREQ-001〜008から削減していない。
- [x] 保存・公開範囲・失敗時のリスクを専用scope/outline照合/再試行で扱う。
- [x] Editor/Runner非取得と既存chunk・容量上限を性能条件として維持する。
- [ ] 最新HEADの独立レビュー・CI・統合後のβ公開を実績で記録する。
