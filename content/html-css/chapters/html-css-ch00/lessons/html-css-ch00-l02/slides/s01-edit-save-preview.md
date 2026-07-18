---
id: html-css-ch00-l02-s01
title: 小さく編集して順番に確かめる
kind: diagram
concept: edit-preview-validate-loop
assets:
  - id: diagram-edit-preview-loop
    source: assets/edit-preview-loop.svg
    mediaType: image
    alt: 編集、保存、Preview、判定を順に進む循環
    provenanceId: ch00-edit-preview-loop-original
---

演習は、コードを小さく編集し、保存状態を待ち、Previewで見た目を確かめ、最後に判定する順で進めます。一度に多くを書き換えないと、予想と違ったときに原因を見つけやすくなります。

TsumuCodeは入力後にDraftを端末へ保存し、少し待ってPreviewを更新します。判定は現在のPreviewを要件と照らし合わせます。「保存済み」を確認してから判定すれば、書いた内容と結果の時点がそろいます。

![編集から判定までの循環](asset:diagram-edit-preview-loop)

:::practice
prompt: Editorの1文字だけを変え、保存状態、Preview、判定Buttonの順に視線を動かして変化を観察します。
expectedAction: 編集から判定までの4段階を順番どおり指し示す
estimatedMinutes: 2
:::

次は、Editor、Preview、案内Panelのどこに何が表示されるかを確認します。
