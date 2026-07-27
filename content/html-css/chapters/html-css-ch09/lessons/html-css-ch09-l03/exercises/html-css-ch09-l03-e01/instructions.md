## auto-fitでResponsive Galleryを作る

`styles.css`の`grid-template-columns`を2か所だけ変更します。

1. `minmax(120px, 1fr)`の最小値を`160px`へ変更します。
2. `repeat(2, ...)`の回数`2`を`auto-fit`へ変更します。
3. 完成形を`repeat(auto-fit, minmax(160px, 1fr))`にします。
4. 実行し、Desktopは4列、Mobileは2列で、どちらにも横Overflowがないことを確認します。

迷ったら「前のスライド」で、同じCSSが利用可能幅に応じて4列と2列へ変わる図を見直せます。
