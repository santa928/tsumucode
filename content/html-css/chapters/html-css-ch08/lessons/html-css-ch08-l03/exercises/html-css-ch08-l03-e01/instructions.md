## 高さの違うItemをCross Axisへ揃える

1. 高さ200pxの`[data-align]`をFlex Containerにします。
2. `align-items: center`で全ItemをCross Axis中央へ揃えます。
3. 高さ40pxの`[data-end]`だけを`align-self: flex-end`へ置きます。
4. 中央Itemのy 102pxと例外Itemのy 192pxを実測で確認します。

Container上端はBody Paddingによるy 32pxです。
