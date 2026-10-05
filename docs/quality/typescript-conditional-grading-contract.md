# union・optional初回演習の型と動作条件

#111で追加する`typescript-ch03-l01-e01`と`typescript-ch03-l02-e01`だけを対象にする。一般のTypeScriptを採点する万能な仕組みではない。型検査・元TSの練習条件・実ConsoleをANDで確認し、固定表示だけで達成にしない。

## 教材と有限の対応範囲

01はtype aliasのunionで、kindがcorrectならpoints:number、incorrectならmessage:stringを持つ形を扱う。文字列literalで状態を限定し、関数の引数へこの型を注釈する。状態を確認した分岐から実際の引数のpoints/messageを返し、正解/不正解の2例で2・もう一度を表示する。

02はinterfaceのhint?:stringを扱う。optional項目を読むとstringかundefinedになるため、引数のhintを確認してlengthかヒントなしを返す。文字列「見る」、項目欠落、空文字の3例で2・ヒントなし・0を表示する。空文字を欠落扱いする条件は型が通っても動作を満たさない。固定CompilerのexactOptionalPropertyTypes設定を維持し、省略と明示したhint:undefinedも区別する。

両演習は単一main.ts、型の定義1つ・引数1つの関数1つ・全Console実行例に限定する。型名/関数名/引数名、型の並び・項目順・引用符、readonly項目の別解を許す。if/else、早期return、条件演算子、条件の反転、optionalのtypeofやinによる存在確認にも対応する。条件式は引数の項目を使う副作用のない比較・論理演算へ限定する。戻り値は引数の項目（または欠落時の案内）から直接取り出す。型が通る原文でも、固定表示・別の値の利用・実行例の省略は学習条件を満たさない。

追加関数・ループ・値の更新・複数ファイル・任意の文法全般はこの初回課題の範囲外。型の確認をなくす/弱める/強制する書き方や診断抑制も範囲外で、一般のTypeScriptの不正とは説明しない。型の習得を型消去後のJavaScript ASTから判定しない。

## Workerと正負の型関係

元TSを有限ASTで確認し、通常の非emit型検査が成功したコピーへだけ信頼側のtype exportを付ける。union-result-v1は正例2・負例3（未知状態、得点の誤型、案内欠落）、optional-hint-v1は正例2・負例2（hintの誤型、明示undefined）を非emitで検査する。負例の診断file・line・code・件数と有効なcolumnを照合し、無関係なエラーを成功に数えない。コピー・probe・AST・生成物をRunner/画面/保存へ渡さない。

返却は要求したprofileと有限のboolean factだけ。Clientは余分なpayload、異なるprofile、前提と不整合なprobe成功を拒否し、既存request/session/revision照合、入力コピー、置換時中止、Worker10秒期限と破棄を使う。

Validatorは元TS/HTML・runtime/session/revisionの既存SHA256証拠を確認し、同じ原文を再型検査する。2課題それぞれの単一必須型Ruleと独立した必須Console条件を固定する。型成功を合格にしない。古い編集世代、Rule欠落/重複/別profile、検査基盤の故障はsystem-errorとして閉じ、不正解へ置き換えない。実行失敗はcode-error、形/分岐または出力不足はincomplete、型失敗は未実行/未採点。

元TS/履歴/passing snapshotの保存契約、実行隔離/通信/停止、Compiler遅延読込、通常入力16file/131072文字は変更しない。学習検査は8192文字・2048 AST node・深さ64以内。性能保証や入力上限の拡大ではない。

## 登録と残る範囲

2Lesson・8枚・2演習・40分の追加で、Courseは3Chapter・6Lesson・24枚・6演習・105分のdraft。時間は見積りで初心者実測ではない。revision2026-10-05.3への空step移行で既存2/3/4Lessonの合格・下書き・履歴を保持する。全量27Lesson/595分案やTS固有性能予算案の承認ではない。全TS制作・Home/Path掲載・最終受入/公開は後続#112〜#115で、初心者/物理実機/正式公開Gateをこの自動検証で代替しない。

型の説明方針は[TypeScript公式Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)と[exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)を確認した。掲載コードは独自制作し、固定Compiler6.0.3と既存Previewでの実行証拠を別途取得する。
