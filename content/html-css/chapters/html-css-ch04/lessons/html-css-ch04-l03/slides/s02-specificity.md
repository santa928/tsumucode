---
id: html-css-ch04-l03-s02
title: SpecificityはSelectorがどれだけ具体的かを比べる
kind: comparison
concept: css-specificity
assets: []
---

同じElementへType SelectorとClass Selectorが届く場合、Class Selectorの方が具体的なので、そのPropertyのValueが選ばれます。

```css
p {
  color: #2d5d62;
}

.note {
  color: #9a3f25;
}
```

Ruleが効かないたびにSelectorを長くしたりimportantを足したりせず、どのRuleが届き、どのSpecificityを持つかを確認します。

:::practice
prompt: class="note"のpへ2つのRuleが届くとき、最終色を予測します。
expectedAction: .noteを選び、Class Selectorがより具体的だと説明する
estimatedMinutes: 2
:::

次は、直接指定がないPropertyがParentから届くInheritanceを見ます。
