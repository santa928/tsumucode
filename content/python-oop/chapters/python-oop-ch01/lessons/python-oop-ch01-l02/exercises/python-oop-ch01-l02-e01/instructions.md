同じ計算のself・cls・明示引数

classmethodではcls.factor、staticmethodでは明示引数factorを使います。

同じ倍率計算を3種類のmethodで実行し、self・cls・暗黙引数なしを呼出形式と実引数から説明できる。

Class名・Instance名・引数名は変えても構いません。属性value/factorとmethod名、表示する比較の順序はこの演習の契約です。出力の直書きは達成としません。imports・継承・任意decorator・私有属性など説明範囲外の構文は採点せず、Sourceを保持します。

実行前に出力を予測し、変更後はConsoleの値を同じ順序で比べてください。誤ったmethod呼出しは実際のTypeErrorとして表示され、環境障害と未達成を区別します。Hint・Resetと保存済みの下書きを使って再試行できます。

## 期待する出力

```text
6
6
6
6
10
10
10
10
12
12
12
6
```
