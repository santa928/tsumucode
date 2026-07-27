## Primary Colorを2つの部品で共有する

1. `:root`のComment直後へ`--color-primary: #2d5d62;`を追加します。
2. `[data-action]`の`background-color`を`var(--color-primary)`へ変更します。
3. `[data-tag]`の`color`も`var(--color-primary)`へ変更します。

実行後に、1つの宣言がActionの背景とTagの文字へ届いたことを確認します。
