---
id: html-css-ch06-l02-s02
title: Contrastは前景と背景の組み合わせで測る
kind: concept
concept: text-contrast
assets: []
---

Text Contrastは文字色だけでは決まりません。同じ灰色でも、白い背景と暗い背景では読みやすさが変わるため、最終的な前景色と背景色を組み合わせて測ります。

通常サイズの本文は4.5:1以上を基準にします。背景が透明なら、祖先Elementの背景までたどった表示結果が必要です。

色だけで「成功」「失敗」を表すと、色を区別しづらい人や白黒表示では意味が失われます。色へ加えて、状態を示すTextやIconのAccessible Nameを用意します。

:::practice
prompt: 緑の丸だけで公開状態を示したUIへ、色以外の手がかりを追加します。
expectedAction: 公開中などの状態Textを加える
estimatedMinutes: 2
:::

次の実習ではContrast 4.5:1と状態Textの両方を確認します。
