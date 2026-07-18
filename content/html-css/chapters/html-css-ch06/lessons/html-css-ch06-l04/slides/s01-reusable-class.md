---
id: html-css-ch06-l04-s01
title: Base Classへ共通の見た目を集める
kind: concept
concept: reusable-base-class
assets: []
---

複数のCardへ同じPadding、背景、Borderを個別に書くと、変更箇所が増えて差分も生まれます。共通RuleをBase Classへまとめると、1つの変更をすべてのCardへ届けられます。

```css
.card {
  padding: 1.5rem;
  background: white;
}
```

Class名そのものより、何を共有する単位かが重要です。Base Classは共通部分だけを持ち、個別の差は追加Classや内容側で表します。

:::practice
prompt: 2枚のCardで重複しているPaddingと背景のRuleを探します。
expectedAction: 共通のBase Classへ移すRuleとして選ぶ
estimatedMinutes: 2
:::

次はComponentの境界を見つけます。
