# Component・Props・Composition導入（Issue #117）

#116の固定QuestionCardへデータを渡す1教材を入口として残し、2Lessonを追加する。Lesson 2は同じComponentへ異なるPropsを渡し、受け取る側のJSXを修正する。Lesson 3はchildrenを受け取る枠と表示Componentを組み合わせる。初心者が表示を予測してから小さく修正できる構成にする。

## 受入と非対象

各LessonにSlide・予測問題・修正Exercise・段階Hint・Solution・正負Fixture・公式出典と概念を登録する。誤型と必須Prop不足を実Compilerで診断し、指定内容を実ReactのDOMで確認する。同じComponentへの異なるPropsと受け取った値の表示、Composition課題のchildren描画も有限な学習条件として確認する。固定表示だけの同じDOMを合格にしない。

内部Component名・引数名・分割数は固定しない。実行入口のexport Appと読み取り専用の起動処理・型・HTMLだけを契約にする。改名・export alias・引数オブジェクト/分割代入を使う正例も確認する。保存/再読込/Reset、PCの編集とKeyboard/Hint、390pxのSlideとPC案内を代表ブラウザで確認し、画像そのものをレビューする。

State/Event/Effect、List/Keyの制作、任意npm、Next.js、全Course受入・正式公開・Path追加は含めない。Reactはdraftを維持する。

## 設計差分と選択理由

既存props-card-v1は変更せず、static-components-v1を追加する。固定main.tsx・types.ts・index.htmlと編集可能components.tsxの4ファイルに限定する。Componentの純粋な表示関数、型付きProps、閉じたJSXのみを有限ASTで受理する。副作用、診断抑制、any/assertion、直接factory、動的参照、再帰、spread/ref/イベント/URL/HTML挿入は拒否する。複雑な一般React評価器を作らず、今回必要な静的表示だけを扱う。

Workerへprofileを明示し、未知profileや起動処理・型の変更を拒否する。読み取り専用UIを信頼せず、ImportしたSourceにも同じ照合を行う。型検査成功後の学習factは有限boolだけを返し、Validatorが同Sourceの再compileと実DOMの検査をANDにする。名前ではなく宣言に解決したComponent呼出しとPropsの表示経路を調べる。再帰循環と過大な静的展開はReactへ渡す前に止める。

学習factは、同じ宣言を異なるPropsで呼び、titleをh2、summaryをpへ実際に表示する経路を要求する。span・strong・補助Componentへの伝播は許可する。今回の2課題ではHTML/内容を組み立てる、CSS/見た目を整えるの組を固定し、値の交換と固定DOMだけの偽達成を拒否する。汎用採点器ではなくこの導入profileの有限契約であり、別題材を追加する場合は契約を再検討する。Compositionでは受け取ったchildren内から表示Cardへ到達することも要求する。

JSXはSourceで256node、静的展開で2048stepを上限とし、childrenは各表示関数で1回だけ読む。型とHTMLを含む4ファイル集合は完全照合する。以前のprops-card-v1の受付範囲は広げない。

Course revision 2026-10-06.1から2026-10-07.1へ空stepsの移行edgeを登録する。IDの変更や意図的Resetはせず、旧LessonのSource・判定履歴・Hint・cursor・passingSnapshotを保持する。追加Lessonは新規未完として扱い、既存のSlide閲覧による完了再計算でCourseを未完へ戻す。初回完了日時は既存契約どおり履歴として保つ。

自己完結した固定React、既存JavaScript Analyzer・sandbox・Source/graph/session/revision、停止/期限/例外、性能上限を再利用する。共有TypeScript専用契約は広げない。

Home/Path/Slideの初期graphからCompiler・React演習・TSX Editorを分離し、HomeとReact演習増分のgzip上限512000 bytesを維持する。Home増分の注意目安20480 bytesは既に超過しており、今回もwarningを記録して上限を変更しない。初回導入時の性能値は[Props Runtime契約](react-props-runtime-contract.md)を参照する。

## 検証の入口

`reactStaticComponents.test.ts`は許可表記・Propsの表示経路・再帰/予算・禁止能力・strict Worker結果を扱う。`react-intro-migration.test.ts`は実MigrationServiceとSlide閲覧による再計算を使う。

`react-composition-fixtures.spec.ts`は2Lesson各7Fixtureを実Worker/Runner/Validatorへ渡し、status・型診断・失敗Rule集合を照合する。改名/分割の別解を合格にし、固定表示と見出し/説明交換はDOMだけ通ってもr07を不合格にする。型定義の改変と旧Sourceの証拠も拒否する。既存`react-props-fixtures.spec.ts`で旧profileの互換性を確認する。

`react-composition-runtime.spec.ts`はPCでSlide閲覧からHintのKeyboard操作、型付きSource修正、実DOM、採点、演習を開き直す操作、保存/再読込/Resetを扱う。長いSourceは行DOMの仮想化に依存せず、通常の全文コピーと保存データで確認する。390pxでは6SlideとPC案内、横幅とaxeを確認する。Firefox/WebKit、物理実機、人の初心者観察、全Course受入は#123へ残す。

## 依存付き小計画

1. 新しい純粋表示の正例・危険な入力・改名と学習条件をRED→GREENで確認し、Worker/Runner/Validatorへ接続する。
2. そのprofileを使う2Lesson、出典/概念、正負Fixtureを追加し、既存Lessonとdraftを保つ。
3. 関連型/Lint/Unit/build、実Fixtureと代表UI、教材hash/出典、独立内容/コードレビューを確認する。
4. push/PR後、対象HEADのremote CI成功を確認してmerge。同merge SHAのmain CI成功後に#117をcloseし、#12の該当子だけ完了にする。次Issueは着手しない。

内容の基準はReact公式のYour First Component、Writing Markup with JSX、Passing Props to a Component。採用toolchainは#116のlockを維持し、公式ページの現行版表示を依存更新の許可とはしない。
