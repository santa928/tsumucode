## メモリ内の記録を集計する

各行に非負の整数が1つある文字列を、RecordのInstanceへ変換して合計します。正常な2行は6、空データは0、不正な文字列と負値はValueErrorにします。OSファイルや外部サービスは使いません。

ClassはInstanceの設計、Record(...)は1件を作る呼出し、record.amountはそのInstanceの値を読む記法です。dataclassの最小の使用だけを扱います。継承・method binding・独自decoratorは後続Courseへ委ねます。

完成条件は、amountの型注釈、負値の明示的な拒否、Generatorを消費するsumと、固定Testの成功です。既習のyieldとStringIOのwithをそのまま使います。
