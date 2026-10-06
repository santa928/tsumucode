## 今回の作る順序

1. 工程2: 正誤と回答済みを使って状態を更新するの周囲と型の案内を読み、今回変える範囲を決めます。
2. readonlyのQuizStateを関数へ渡し、実際の正誤で得点を作り、回答後の次問とカテゴリを保つ再挑戦へつなぐ。
3. 問題・選択肢・得点を予測してから実操作し、Checklistと保存した原文を確認します。

公開型名Question・QuizState・Category・LoadMode・LoadResultと関数の窓口、mountQuizの接続は保ちます。引数/ローカル名の変更、括弧、関数宣言/型を明示したarrow、readonly配列表記の有限な別解を扱います。任意のTS構文を採点する仕組みではありません。

提供quiz-ui.tsはHTML要素とfocusを扱い、main.tsのデータ/回答/次問/読み込み/対象確認を呼びます。現在のQuizStateを書き換えず、createState・answer・advanceが返した状態を使います。questions.tsは80ms後に同梱のunknownを返し、拒否後のWebは順序が変わります。通信しません。

型のexport interface/typeとimport typeは実行JSへ残りません。実行する関数のimportは残ります。対応環境は固定TypeScript 6.0.3 / Node 24.18.0のDockerと実Browserです。見積り時間は初心者の実測ではありません。
