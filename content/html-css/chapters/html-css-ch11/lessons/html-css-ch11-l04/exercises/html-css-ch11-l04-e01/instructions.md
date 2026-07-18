## Reduced MotionとOverflowを最終確認する

1. `.reduce-motion .motion-card`のAnimation Durationを`0.001s`へ短縮します。
2. 実際の利用者設定に備えて、`@media (prefers-reduced-motion: reduce)`にも同じ短縮を指定します。
3. `[data-page]`を390pxと1280pxの両方へ収め、横Overflowを防ぎます。
4. 判定結果でDurationとOverflowを別々に確認します。

Animation名やContainerの最大幅は、2つの観測条件を満たす別案でも合格します。
