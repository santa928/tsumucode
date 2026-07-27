## repeatとfrで3つの等幅Trackを作る

`styles.css`の`[data-grid]` Ruleを1か所だけ編集します。

1. `grid-template-columns: 200px 200px 200px;`を探します。
2. Value全体を`repeat(3, 1fr)`へ変更します。
3. 既にある`display: grid;`、`width: 600px;`、`gap: 16px;`は残します。
4. 実行し、3列が等幅で、2枚目のxが約237.33pxになることを確認します。

迷ったら「前のスライド」で`(600 - 16 × 2) ÷ 3`の図を見直せます。実測値はBrowserの丸めを考慮して1pxの幅を許容します。
