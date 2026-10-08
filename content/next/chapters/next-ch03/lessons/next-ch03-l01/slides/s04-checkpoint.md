---
id: 'next-ch03-l01-s04'
title: '開発時の条件を揃えて判定する'
kind: 'reflection'
concept: '期限後の再検証を観察する'
layout: 'checkpoint'
teachesConceptIds: [next-revalidate]
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

コードを書き換えたときのHMRでは、no-storeの応答も開発用の仕組みで再利用される場合があります。一般の開発環境では、ブラウザの強制再読込が送るno-cacheも比較に影響します。

今回の固定Previewと判定器はno-cacheを渡さず、同じ保存版の実HTTPで条件を揃えます。保存して反映すると制御データと保持した値を初期化します。表示だけを固定せず、freshの変化、cachedの保持、revalidateの期限後の更新を確かめます。

:::prediction
prompt: "HMR直後に番号が同じだった、という1回の観察だけでno-storeを否定できますか。"
answer: "できません。開発時の保持と通常のHTTP要求を区別します。"
explanation: "今回の判定結果と比べるときも、保存版と要求条件を揃えます。"
:::
