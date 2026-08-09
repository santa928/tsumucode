---
id: javascript-ch03-l03-s02
title: 外側の変数はFunction内からも使える
kind: concept
concept: global Scope
layout: comparison
teachesConceptIds: [global-scope]
masteryTarget: read
screenBudget: { maxTextCharacters: 270, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

どのFunctionの内側でもない場所で宣言した変数はglobal Scopeにあります。後ろに書かれたFunctionの内側からも参照できます。

```js
const courseName = 'JavaScript';

function showCourse() {
  console.log(courseName);
}
```

:::practice
prompt: showCourseの内側から使える外側の変数名を答えます。
expectedAction: courseNameと答える
estimatedMinutes: 1
:::
