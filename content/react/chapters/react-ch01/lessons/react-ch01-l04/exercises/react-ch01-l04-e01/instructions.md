## 修正と操作

通常ボタンを2回押した後に「2増やす」を押すと、Starterでは3になります。4になるようtwiceを修正します。見た目の数字を書き換えず、Eventから同じStateの更新と表示へつなげましょう。

## 足場と判定

useStateは数値とsetter（Stateを更新する関数）を返すReactのHookです。HookはComponentの先頭で呼び、setterへ渡すupdaterは副作用なしで次の値を返します。main・types・HTMLは用意済みです。型検査、初期表示、複数クリック、1操作内の複数更新を別々に検証します。

名前や整形、通常ボタンをinline関数にする違いは自由です。この演習は1つのStateと同期clickだけを扱い、EffectやFormは後続単元です。
