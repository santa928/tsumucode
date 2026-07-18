## KeyboardでたどれるActionを仕上げる

1. `[data-action]`のLinkとButtonをKeyboard Focus可能な要素として保ちます。
2. `[data-focus-demo]`に表示されるFocus Indicatorを3px以上の`outline`にします。
3. `:focus-visible`へ同じIndicatorを指定し、実際のKeyboard操作でも現在地を示します。
4. Previewと判定結果でFocusabilityとOutline Widthを別々に確認します。

Class名、色、太さは、観測条件を満たす別案でも合格します。
