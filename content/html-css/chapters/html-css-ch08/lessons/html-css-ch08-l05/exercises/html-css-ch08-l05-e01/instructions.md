## AccessibleなNavigationとCard Rowを組む

1. Profile NavigationをFlexboxで横並びにします。
2. Navigationへ目的が分かるAccessible Nameを付けます。
3. Card RowもFlex Containerにし、幅160pxのCard間へ16pxのGapを作ります。
4. 2枚目のCardがx 208pxへあり、Rowが横Overflowしないことを確認します。

TextやClass名ではなく、Navigationの名前とCardの実測Geometryで判定します。
