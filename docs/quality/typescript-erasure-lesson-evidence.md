# 型消去Lesson原稿の作者検証

2026-10-01。対象はcontent外のtypescript-ch01-l03-draft。4枚・15分・1演習・9Fixtureを通常Compiler形式で制作し、前提01-02を保持した。通常Courseの集計や公開Pathは変更していない。独立内容レビューは未実施で、承認済み台帳へは追加していない。

原稿directoryのsource hashは `f1fefe8d81032e70d867c2e926e934ee0361a432a79446ac504b33a35b156af0`。既存computeLessonSourceHashで、AUTHORING.mdを含む整形後のdirectoryからDocker内で算出した。Proが再計算したhashではない。

最終入力で既存内容testに3番目を追加し、3導入原稿の15件が成功（4.73秒）。掲載例、概念/用語/Fixture/前提参照、学習画面へSolution/Fixtureを出さない境界を検査した。s02は型誤り2322/line1で生成JSなし。他の例は型検査成功し、型注釈が生成JSに残らず、s03のthrowが残ることを確認した。

通常YAMLの9Fixtureを実TypeScript Worker/Runnerで実行したChromium1件が成功（10.5秒）。型誤りと実行時失敗の3例はRunner診断で停止し、残り6例は実ValidatorでConsoleを判定した。表示後throwのConsole2を成功扱いにせずcode-errorにした。Solution/加算別解/型推論/表示だけの固定値はpass、値3/空出力はincomplete。このLessonは動作課題なので、表示固定のpassを型注釈や型消去の理解の証拠へ拡張しない。

型検査、対象Lint、3Course Compileが成功。Course Compile初回はmacOSのtar転送で生成されたAppleDoubleの未参照Fileを検出して失敗し、Docker一時mirror内だけで転送メタデータを退避後に成功した。ホスト依存やglobal設定は変更していない。今後の転送はCOPYFILE_DISABLEを1コマンドに指定してメタデータ混入を避ける。

既存SlideStageの4枚表示1件が成功（663ms）。1280×900の画像4枚を目視し、TS/JS各2行の対比、throw例、本文と練習欄の読み順・収まりを確認した。整形で4枚のMarkdown本文は変わっておらず、この表示証拠を再利用する。Course全体の連続操作、新Lessonの保存再読込、reflow/実機/初心者試用の証拠ではない。

Runtime/Compiler/保存形式/依存/公開内容は変更していないため、全suite・全Browser・性能・Release Gate・公開URL smokeはこの原稿段階では実行していない。Course登録時に前提概念・用語初出・品質図・集計・連続UIを確認し、公開時には既存Gateを満たす。

- [x] 受け入れ条件: 4枚、通常Compiler、掲載例、型消去/処理保持、正負の実Runner/Validatorを確認。
- [x] 非対象: Course登録・全コース完成・公開・人の受入を含めない。
- [x] リスクと対策: 型と実行の失敗、型消去と処理削除を対比し、Consoleだけの理解評価の限界を記録。
- [x] 性能目標: 既存Compiler/Runnerの上限と遅延読込みを維持。15分は設計の見積り。
