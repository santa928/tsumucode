---
id: html-css-ch11-l01-s01
title: DOM順がKeyboardの移動順を作る
kind: diagram
concept: keyboard-focus-order
layout: comparison
teachesConceptIds: [dom-order, keyboard-operation]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 0, maxVisuals: 1 }
assets:
  - id: diagram-focus-path
    source: assets/diagram-focus-path.svg
    mediaType: image
    alt: プロフィール、作品一覧、次の教材へ1、2、3の順でFocusが移る図
    provenanceId: ch11-focus-path-slide-original
---

Tabによる移動は、画面上の座標ではなくHTMLのDOM順を基準にします。`href`を持つ`a`や`button`は、特別な属性を足さなくてもKeyboardで移動・操作できます。

![DOM順とKeyboard Focusの経路](asset:diagram-focus-path)

:::practice
prompt: 図の1から3までをTabで移動したときの順序を説明する
expectedAction: プロフィール、作品一覧、次の教材の順と答える
estimatedMinutes: 2
:::

見た目だけをCSSで並べ替える前に、HTMLの順序が内容の流れと一致するかを確認します。次は、現在地を見せるCSSです。
