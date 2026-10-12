## 型・明示検証・集計を完成する

amountの注釈をint、負値のpassをValueError、totalの0をsumへ直します。Class/Function名と固定Testの入力・期待値・表示は保ちます。括弧・空白・コメント・docstringの説明変更は許されます。固定課題の構造と実出力を採点し、任意の等価プログラムを判定するものではありません。

期待するConsoleはTrue、6、0、不正: ValueErrorが2行、Test成功です。Trueは型注釈だけでは文字列を拒否しない観察です。正常/不正/空データの処理はそれぞれ別のTestで確認します。

Test失敗は未達です。Runtime Errorは実行コードの未捕捉例外、未採点は教材外構文や環境障害です。成功後に保存して再開し、最初に戻すとstarterとTest失敗へ戻ることも確認してください。
