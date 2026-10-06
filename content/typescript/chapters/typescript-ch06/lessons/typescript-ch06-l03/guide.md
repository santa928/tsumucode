## 今回の作る順序

1. 工程3: unknownを検証し非同期の結果と失敗を区別するの周囲と型の案内を読み、今回変える範囲を決めます。
2. 同梱Promiseのunknownを各問題の項目と選択肢から検証し、実Errorのmessageと再試行を、Event対象確認を保った完成クイズへ接続する。
3. 問題・選択肢・得点を予測してから実操作し、Checklistと保存した原文を確認します。

公開型名Question・QuizState・Category・LoadMode・LoadResultと関数の窓口、mountQuizの接続は保ちます。引数/ローカル名の変更、括弧、関数宣言/型を明示したarrow、readonly配列表記の有限な別解を扱います。任意のTS構文を採点する仕組みではありません。

提供quiz-ui.tsはHTML要素とfocusを扱い、main.tsのデータ/回答/次問/読み込み/対象確認を呼びます。現在のQuizStateを書き換えず、createState・answer・advanceが返した状態を使います。questions.tsは80ms後に同梱のunknownを返し、拒否後のWebは順序が変わります。通信しません。

型のexport interface/typeとimport typeは実行JSへ残りません。実行する関数のimportは残ります。対応環境は固定TypeScript 6.0.3 / Node 24.18.0のDockerと実Browserです。見積り時間は初心者の実測ではありません。
