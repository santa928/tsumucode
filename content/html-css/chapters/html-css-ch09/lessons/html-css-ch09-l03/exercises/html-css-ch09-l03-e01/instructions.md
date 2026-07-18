## auto-fitでResponsive Galleryを作る

1. `[data-gallery]`をGrid Containerにします。
2. `repeat(auto-fit, minmax(160px, 1fr))`とGap 16pxを指定します。
3. 幅を100%、上限を720pxにします。
4. Desktopでは3枚目が1行目、Mobileでは2行目にあり、両方で横Overflowがないことを確認します。

同じCSSが利用可能幅に応じて4列と2列へ変化します。
