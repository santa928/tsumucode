## Primary Colorを2つの部品で共有する

1. `:root`へ`--color-primary: #2d5d62`を宣言します。
2. `[data-action]`のBackground Colorで変数を利用します。
3. `[data-tag]`のText Colorでも同じ変数を利用します。
4. 両方のComputed Colorが`rgb(45, 93, 98)`になったことを確認します。

宣言した値を1箇所だけ変え、2つの部品へ同時に届くこともPreviewで試します。
