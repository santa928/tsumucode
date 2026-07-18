---
id: html-css-ch08-l03-s01
title: align-itemsは全ItemをCross Axisへ揃える
kind: concept
concept: align-items
assets: []
---

`align-items`はContainer内のすべてのItemをCross Axisへ揃えます。高さの違うItemを`center`へ置くと、それぞれの中央がContainerの中央線へ合います。

`stretch`はCross SizeがautoのItemを伸ばします。固定Heightがある場合は伸びないため、指定済みの寸法も確認します。

:::practice
prompt: row方向のContainerで高さの違うItemを縦中央へ揃える値を答えます。
expectedAction: align-items centerと答える
estimatedMinutes: 2
:::

1つだけ変えたいときはalign-selfを使います。
