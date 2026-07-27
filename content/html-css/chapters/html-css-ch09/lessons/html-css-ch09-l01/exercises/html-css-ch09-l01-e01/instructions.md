## 160pxと240pxのGrid Trackを作る

`styles.css`の`[data-grid]` Ruleだけを編集します。

1. `display: block;`のValueを`grid`へ変更します。
2. `grid-template-columns: 200px;`のValueを`160px 240px`へ変更します。
3. 既にある`width: 416px;`と`gap: 16px;`は残します。
4. 実行し、左Cardが160px、右Cardが240px、2枚目のxが208pxになることを確認します。

迷ったら「前のスライド」で、2つのValueが左から順に列幅へ対応する図を見直せます。
