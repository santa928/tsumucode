## Guide 2 — Focus表示と4 Viewport

1. PrimaryとContact Linkへ`:focus-visible`の3px実線Outlineと4px Offsetを付ける
2. 390pxでTextとActionの収まりを見る
3. 768pxでSection間の余白を見る
4. 1280pxと1440pxで最大幅とCard列を確認する

Mouse操作だけでなくKeyboard FocusとHorizontal Overflowも測ります。装飾Animationは追加せず、動きが必要になった時点でReduced Motion対応を一緒に設計します。
