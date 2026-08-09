---
id: javascript-ch03-l03-s04
title: 必要な場所へ変数を置き分ける
kind: concept
concept: Scopeに合わせた変数配置
layout: code-preview
teachesConceptIds: [scoped-labels]
masteryTarget: transform
screenBudget: { maxTextCharacters: 320, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: javascript-ch03-l03-scope-map
    source: assets/scope-map.svg
    mediaType: image
    alt: globalのcourseNameの内側にFunction localのlessonNameがあるScope図
    provenanceId: javascript-ch03-l03-scope-map-original
---

演習では、`courseName`は外側に残し、`lessonName`の宣言だけを`showLabels`の波括弧内へ移動します。

```js
const courseName = 'JavaScript';

function showLabels() {
  const lessonName = 'Scope';
  console.log(courseName);
  console.log(lessonName);
}
showLabels();
```

![globalとlocalのScope](asset:javascript-ch03-l03-scope-map)

:::practice
prompt: どちらの変数をFunction内へ移すか答えます。
expectedAction: lessonNameだけを移すと答える
estimatedMinutes: 1
:::
