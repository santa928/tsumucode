---
id: next-ch01-l01-s03
title: Route HandlerはJSONを返す
kind: concept
concept: Route HandlerはJSONを返す
layout: comparison
teachesConceptIds: [next-route]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

`app/api/question/route.ts`のGETは、HTTPのGETリクエストを受け取ります。pageのJSXとは別に、`Response.json`でJSONを返します。

```ts
const mode = new URL(request.url).searchParams.get('mode');
const second = mode === 'second';
```

通常のURLと`?mode=second`のURLを別々に要求し、messageを比べます。両方を同じ値にすると、queryの分岐を確認できません。

このLessonはGETだけです。CookieやServer Actions、外部APIは扱いません。採点は実serverの応答を読みます。

:::prediction
prompt: "queryがmode=secondのとき、コードのsecondはtrueとfalseのどちらですか。"
answer: "secondはtrueになります。"
explanation: "queryから取った文字列がsecondと一致するためです。messageの分岐は次の修正課題で確かめます。"
:::
