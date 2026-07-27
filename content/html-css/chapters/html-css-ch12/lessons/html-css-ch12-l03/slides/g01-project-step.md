---
id: html-css-ch12-l03-g01
title: SkillsとWorksを再利用できる部品にする
kind: guide
layout: code-preview
teachesConceptIds: [skills, works]
masteryTarget: compose
screenBudget: { maxTextCharacters: 400, maxCodeLines: 10, maxVisuals: 1 }
assets:
  - id: skills-works-system
    source: assets/skills-works-system.svg
    mediaType: image
    alt: SkillsのListとWorksのCard群が共通Surfaceの中で別のLayoutを使う図
    provenanceId: ch12-skills-works-system-original
---

内容のまとまりはHTMLで、繰り返す見た目はClassで表します。Skillsは`ul`、Worksは複数の`article`にして、役割に合うLayoutを選びます。

![SkillsとWorksの部品構成](asset:skills-works-system)

```html
<section class="surface-card">
  <div data-works-layout class="works-grid">
    <article class="work-card">Profile Card</article>
    <article class="work-card">Learning Note</article>
  </div>
</section>
```

`.works-grid`へ`display: grid`と`grid-template-columns: repeat(2, 1fr)`を指定します。

:::practice
prompt: Skill名の集まりにdivではなくulとliを使う理由を答えます。
expectedAction: 順序のない項目の集まりという意味をHTMLで表せるためと説明する
estimatedMinutes: 2
:::

実習ではAboutとSkillsを仕上げたあと、2件のWork CardをGridへ並べます。Responsive化は次の工程です。
