---
id: html-css-ch00-l02-s02
title: File Tabで編集する場所を切り替える
kind: code
concept: workspace-regions
layout: code-preview
teachesConceptIds: [edit-save-preview-validate, file-tab]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 2, maxVisuals: 1 }
assets:
  - id: diagram-edit-preview-loop-files
    source: assets/edit-preview-loop.svg
    mediaType: image
    alt: 1箇所ずつ編集しPreviewと判定へ進む流れ
    provenanceId: ch00-edit-preview-loop-original
---

Editor上部の`index.html`と`styles.css`がFile Tabです。題名ならHTML、背景色ならCSSのTabを選びます。Tabを切り替えても、もう一方のFileに書いた内容は保存されています。

```text
index.html  → <h1>の日本語
styles.css  → background-colorの右側の値
```

![各Fileで1箇所ずつ編集して確認する流れ](asset:diagram-edit-preview-loop-files)

:::practice
prompt: index.html、Preview、styles.css、Previewの順に視線を移し、変わる場所を予測します。
expectedAction: File Tabごとに1箇所だけ編集し、毎回Previewを確認する
estimatedMinutes: 2
:::

判定が未達なら、案内の対象と次の操作を読み、関係するTabへ戻ります。
