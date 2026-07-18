---
id: html-css-ch04-l03-s01
title: 同じ強さのRuleは後のDeclarationが選ばれる
kind: diagram
concept: cascade-source-order
assets:
  - id: diagram-cascade
    source: assets/diagram-cascade.svg
    mediaType: image
    alt: Inheritance、Specificity、Source Orderを順に積みComputed Valueへ至る図
    provenanceId: ch04-cascade-slide-original
---

同じElement、同じPropertyへ、同じSpecificityのRuleが複数届くと、Stylesheetで後に書かれたDeclarationが選ばれます。これがSource Orderです。

![CSS Cascadeが値を選ぶ積層図](asset:diagram-cascade)

後に書けば常に勝つわけではありません。まずOriginや重要度、次にSpecificityを比べ、同点のときにSource Orderを使います。

:::practice
prompt: 同じ.accent Selectorが2回あり色だけ違う場合、どちらが選ばれるか予測します。
expectedAction: 後のRuleを選び、同じSpecificityであることを理由にする
estimatedMinutes: 2
:::

次は、Selectorの具体性によるSpecificityを比べます。
