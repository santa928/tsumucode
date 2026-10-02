# 型消去と実行時失敗の未登録原稿

2026-10-01。Issue #11の導入3番目として独自制作した4枚・15分・1演習。content/Course/Catalog/Pathにはまだ登録していない。前提は型注釈01-02とJavaScriptのthrow/Error/Consoleで、Lesson全体の独立レビューは未実施。

| 要件              | 区分 | 今回の原稿                                                                                |
| ----------------- | ---- | ----------------------------------------------------------------------------------------- |
| REQ-TSC-003       | 維持 | 型誤りは生成JSへ進まず、実行・採点しない。元TSの境界を既存Compiler/Runnerへ接続する。     |
| REQ-TSC-004       | 維持 | 型検査を通ってもthrowで実行時に止まり得ることを教える。                                   |
| REQ-TSC-006       | 維持 | 通常形式の4枚、Exercise/Starter/Solution/3段階Hint/正負Fixture/用語/概念/出典を制作する。 |
| REQ-TSC-009       | 維持 | 型誤り・実行時診断・修正後のConsoleを実Runnerで区別する。                                 |
| REQ-TSC-ERASE-001 | 追加 | 型注釈の消去と、生成JSにthrowが残る対比を固定Compilerで確認する。                         |

既存条件の削除・保留はない。27Lesson/595分の全量提案は維持し、本Lessonだけを完成したコースとは扱わない。画面量は本文300文字/枚、コード2〜4行/枚。s01はTSとJSの各2行を並べるため合計4行とし、残りは最大3行。15分は設計上の見積りで、初心者の読了実測ではない。

演習は練習用のthrowを除いて表示へ到達させる動作課題で、型注釈の存在や特定の構文を学習採点条件にはしない。型検査と既存Runnerの成功を前提に、Consoleの2が1回という動作を判定する。推論だけの解や表示だけの固定値も合格するfixtureを明示し、その合格から型注釈・型消去の理解を証明したとは主張しない。理解はSlide内の説明練習と人の試用で確かめる。

Fixtureは9件。Starterと表示後throwはcode-error、文字列初期値は型誤り2322のcode-error、Solution/加算別解/推論/表示のみはpass、値3/空出力はincompleteを期待する。表示が先に出ても実行時診断を無視してpassへ扱わない。意図した型誤りを含む教材.tsは通常アプリLintからだけ除外し、Compilerと実Runnerの検査を残す。

画面は生のError文字列ではなく共通の実行失敗案内を出すため、その境界に本文を合わせる。型注釈を追加すればthrowが消えるとは教えない。throwは失敗を知らせる用途もあるので、一般に削除すべきものとは教えない。Console例に関係しない「対象Element」という汎用案内を原因特定として扱わない。

一次資料は[TypeScript Handbook: The Basics / Erased Types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types)を2026-10-01に確認した。文章と教材例は独自制作。TypeScript一般の設定をTsumuCodeの固定設定と混同せず、この教材では型誤り時にJSを返さないと説明する。

受け入れ条件は通常Compiler参照・掲載例・型注釈消去/throw保持・9Fixtureの実Runner・既存SlideStageでの表示確認。非対象は通常Course登録、全量確定、公開、初心者/実機の受入。リスクは型成功と動作成功の混同、型消去と処理削除の混同で、対比と正負実行例で確認する。Compiler/Runner/保存形式/遅延読込み/通信・待機上限は変更しない。重いRelease Gateは公開前に確認し、この制作段階の検査から成功扱いにしない。

現段階の記録: 原稿がない状態で既存内容testを追加して失敗を確認し、制作後に3導入原稿15testが成功。掲載例のs02は2322/line1でJSなし、s01/s03/s04は型検査成功。生成JSに型注釈がなく、s03のthrowが残ることも検査した。初回の全Course CompileはmacOS転送時のAppleDoubleファイルで失敗し、Docker一時mirror内の転送メタデータを別directoryへ退避後、3Course Compileが成功した。起動前のブラウザ検査は接続不能で失敗し、起動完了後に取り直した。

Docker Chromiumの実採点は通常YAMLの9Fixtureを既存TypeScript Worker/Runner/Validatorへ渡して1test成功（11.8秒）。SlideStage表示は4枚で1test成功（663ms）。1280×900の画像4枚を実目視し、TS/JSの対比、本文、コード、練習欄の読み順と収まりを確認した。画像はSlide単体表示であり、Course全体の遷移・新Lessonの保存再読込・実機の確認ではない。

未完了は独立内容レビュー、source hashの承認、最新HEADレビュー/必要CI、Courseへの統合と連続UI。指定レビュー用Chatの継続先は別途本人確認待ちで、作者の自動検査を独立レビューの代用にはしない。

- [x] 受け入れ条件と理解確認の限界を保持。
- [x] 非対象を保持し、Course登録・公開を含めない。
- [x] リスクと対策を正負例へ反映。
- [x] 性能目標は既存上限を維持し、画面量と見積りを区別。
