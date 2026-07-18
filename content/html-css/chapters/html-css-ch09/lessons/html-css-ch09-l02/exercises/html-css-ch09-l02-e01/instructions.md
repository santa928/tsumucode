## repeatとfrで3つの等幅Trackを作る

1. 幅600pxの`[data-grid]`をGrid Containerにします。
2. `repeat(3, 1fr)`で3つの等幅Columnを作ります。
3. Track間へ16pxのGapを指定します。
4. 2枚目のxが約237.33pxとなり、横Overflowがないことを確認します。

BrowserのSubpixel丸めを含むため、実測値には1pxの許容幅があります。
