## Reduced MotionとOverflowを最終確認する

`styles.css`のValueを2箇所だけ変更します。

1. `@media (prefers-reduced-motion: reduce)`内にある`.motion-card`の`animation-duration: 0.8s;`を`0.001s`へ変更します。
2. `[data-page]`の`width: 900px;`を`width: min(100%, 44rem);`へ変更します。
3. `@media`の条件と完成済みのFocus、label、alt、Link Text、状態Textは残します。
4. 判定ではreduce設定を再現したPreviewでDurationを測り、2 ViewportのOverflowと7つの完成済みAccessibility条件も確認します。

編集対象はDurationとContainer幅だけです。
