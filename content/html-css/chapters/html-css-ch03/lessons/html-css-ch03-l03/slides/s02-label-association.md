---
id: html-css-ch03-l03-s02
title: labelのforとControlのidを一致させる
kind: code
concept: label-association
assets: []
---

見える`label`は、何を入力する欄かを伝えます。`for`属性の値とControlの`id`を同じにすると、2つがProgram上も1組になります。

```html
<label for="display-name">表示名</label> <input id="display-name" name="displayName" type="text" />
```

関連付けると、読み上げで「表示名、編集Text」のように目的が伝わり、LabelをClickしてもInputへFocusできます。PlaceholderだけをLabel代わりにしません。

:::practice
prompt: forとidの値を見比べ、一致しない場合にどちらを直すか考えます。
expectedAction: 同じ空でないIDにそろえる必要を説明する
estimatedMinutes: 2
:::

次は、Buttonが意図せず送信しないようtypeを選びます。
