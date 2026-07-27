---
id: html-css-ch11-l04-s01
title: Motionを減らす利用者設定を尊重する
kind: concept
concept: reduced-motion-preference
layout: code-preview
teachesConceptIds: [prefers-reduced-motion]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: reduced-motion-condition
    source: assets/reduced-motion-condition.svg
    mediaType: image
    alt: 利用者のreduce設定がMedia Query条件を通ってMotion CardのDurationを短くする流れ
    provenanceId: ch11-reduced-motion-condition-original
---

`prefers-reduced-motion`は、Motionを減らしたい利用者設定をCSSへ届けるMedia Featureです。

![Reduced Motion条件からRuleへ届く流れ](asset:reduced-motion-condition)

```css
@media (prefers-reduced-motion: reduce) {
  .motion-card {
    animation-duration: 0.001s;
  }
}
```

`@media`の丸括弧内が条件、波括弧内が条件成立時のRuleです。情報に必要な状態変化は残し、長い移動や点滅だけを止めるか極めて短くします。

:::practice
prompt: Starterの0.8sを何秒へ変更するか答えます。
expectedAction: 0.001sへ変更すると答える
estimatedMinutes: 2
:::

実習では本物の`@media (prefers-reduced-motion: reduce)`内にあるValueを0.001sへ変更します。判定時はreduce設定のPreviewを再現し、Computed Durationまで確認します。
