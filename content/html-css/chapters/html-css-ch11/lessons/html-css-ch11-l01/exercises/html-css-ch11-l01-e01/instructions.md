## KeyboardでたどれるActionを仕上げる

`styles.css`に用意されたFocus Ruleで、数値を1箇所だけ変更します。

1. `[data-action]:focus-visible, .is-focus-visible` Ruleを探します。
2. `outline: 0 solid #ef7d4f;`の`0`を`3px`へ変更します。
3. 完成済みの`outline-offset: 3px;`とHTMLのLink・Buttonはそのまま残します。
4. Previewで橙色の線を確認し、判定でFocusabilityとOutline Widthを確認します。

色は別案でも合格します。編集対象は`outline`の太さだけです。
