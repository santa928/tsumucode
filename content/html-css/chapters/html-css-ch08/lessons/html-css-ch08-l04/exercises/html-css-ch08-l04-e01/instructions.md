## 3枚ずつ折り返すCard Gridを作る

1. 幅600pxの`[data-card-grid]`をFlex Containerにします。
2. `flex-wrap: wrap`と`gap: 16px`を指定します。
3. 4枚のCardへ`flex-basis: 180px`とHeight 100pxを指定します。
4. 3枚目が1行目のy 24pxへあり、横Overflowがないことを確認します。

3枚分は572pxで収まり、4枚目は次のLineのy 140pxへ進みます。
