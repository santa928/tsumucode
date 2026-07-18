---
id: html-css-ch04-l04-s02
title: Computed ValueはBrowserが最終的に使う値
kind: concept
concept: computed-values
assets: []
---

Stylesheetへ`2rem`と書いても、BrowserはInheritanceやRoot Font Sizeを解決し、Layoutに使うComputed Valueをpxで持つことがあります。

TsumuCodeの判定は、単なるSource文字列ではなくPreview SnapshotのComputed Styleを読みます。そのため`32px`と同じ結果になる妥当な書き方も許容できます。

小数計算ではBrowser差が生じる場合があるため、Length判定には小さなToleranceを持たせます。目標から大きく外れた値まで許すわけではありません。

:::practice
prompt: 2remと32pxが同じComputed Valueになる条件を説明します。
expectedAction: Root Font Sizeが16pxであることを根拠にする
estimatedMinutes: 2
:::

次の実習ではremでPaddingを設定し、Computed px値で結果を確認します。
