---
id: html-css-ch01-l02-s01
title: Elementの中へElementを入れられる
kind: diagram
concept: html-nesting-tree
layout: explanation
teachesConceptIds: [html-parent-child, nesting]
masteryTarget: read
screenBudget: { maxTextCharacters: 360, maxCodeLines: 0, maxVisuals: 1 }
assets:
  - id: diagram-dom-tree
    source: assets/dom-tree.svg
    mediaType: image
    alt: bodyの子にmain、その子にh1とpがある親子関係の図
    provenanceId: ch01-dom-tree-original
---

Elementの中へ別のElementを入れることをNestingと呼びます。外側がParent、直接内側にあるものがChildです。図では`main`が`body`のChildで、`h1`と`p`は`main`のChildです。

![body、main、h1、pの親子関係](asset:diagram-dom-tree)

:::practice
prompt: 図でmainのParentと、mainの2つのChildを指します。
expectedAction: bodyがParent、h1とpがChildだと説明する
estimatedMinutes: 2
:::

次は、この親子関係をコードの字下げで見える形にします。
