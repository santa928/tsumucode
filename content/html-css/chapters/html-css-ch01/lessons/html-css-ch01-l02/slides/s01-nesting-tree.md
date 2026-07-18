---
id: html-css-ch01-l02-s01
title: Elementの中へElementを入れられる
kind: diagram
concept: html-nesting-tree
assets:
  - id: diagram-dom-tree
    source: assets/dom-tree.svg
    mediaType: image
    alt: mainの子にsection、その子にh2とpがある親子関係の図
    provenanceId: ch01-dom-tree-original
---

HTMLでは、あるElementの内容として別のElementを入れられます。この構造をNesting、外側をParent、内側をChildと呼びます。Webページは箱を並べるだけでなく、箱の中へ小さな箱を積むTreeとして読めます。

`main`の中に`section`、その中に`h2`と`p`があると、sectionはmainのChildであり、h2とpのParentです。閉じる順番は後から開いた内側のElementが先になります。

![main、section、h2、pの親子関係](asset:diagram-dom-tree)

:::practice
prompt: 図でsectionのParentと、sectionのChildをそれぞれ指します。
expectedAction: mainがParent、h2とpがChildだと関係を説明する
estimatedMinutes: 2
:::

次は、同じTreeをコード上で読みやすくするIndentationを使います。
