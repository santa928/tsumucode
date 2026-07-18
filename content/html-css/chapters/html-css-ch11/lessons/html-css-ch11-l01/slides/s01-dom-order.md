---
id: html-css-ch11-l01-s01
title: DOM順がKeyboardの移動順を作る
kind: diagram
concept: keyboard-focus-order
assets:
  - id: diagram-focus-path
    source: assets/diagram-focus-path.svg
    mediaType: image
    alt: プロフィール、作品一覧、次の教材へ1、2、3の順でFocusが移る図
    provenanceId: ch11-focus-path-slide-original
---

Tabによる移動は、画面上の座標ではなくHTMLのDOM順を基準にします。CSSで見た目だけを並べ替える前に、読み上げ順と操作順が内容の流れに合っているか確認します。

![DOM順とKeyboard Focusの経路](asset:diagram-focus-path)

:::practice
prompt: 図の1から3までをTabで移動したときの順序を説明する
expectedAction: プロフィール、作品一覧、次の教材の順と答える
estimatedMinutes: 2
:::

次の観察または実習で、見えるFocus Indicatorを確認します。
