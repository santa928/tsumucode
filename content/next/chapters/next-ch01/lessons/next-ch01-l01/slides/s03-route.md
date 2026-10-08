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

このLessonはGETだけです。CookieやServer Actions、外部APIは扱いません。以下の文字列は期待値の説明で、採点は実serverの応答を読みます。

:::practice
prompt: mode=secondのとき、messageには何を返しますか。
expectedAction: 2つ目の実リクエストと答える
estimatedMinutes: 1
:::
