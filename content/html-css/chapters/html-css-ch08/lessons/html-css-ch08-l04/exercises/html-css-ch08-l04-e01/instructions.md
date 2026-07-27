## 3枚ずつ折り返すCard Gridを作る

1. `[data-card-grid]`の`flex-wrap: nowrap;`を`wrap`へ変えます。
2. `[data-card]`の`flex-basis: 220px;`を`180px`へ変えます。
3. `flex-shrink: 0;`は完成済みなので変更しません。
4. Previewで3枚目が1行目のy 24pxへあり、4枚目が次のLineへ進むことを確かめます。

3枚分は`180 × 3 + 16 × 2 = 572px`です。手が止まったら「前のスライド」で幅の図を見直せます。
