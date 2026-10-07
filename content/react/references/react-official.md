# React導入教材の出典

文章・例・演習は本プロジェクトが独自に制作し、次の公式資料の概念と照合しています。公式例の複写や翻訳ではありません。

- [Your First Component](https://react.dev/learn/your-first-component): 表示関数、大文字のComponent名、呼び出しと再利用。
- [Writing Markup with JSX](https://react.dev/learn/writing-markup-with-jsx): JSXのタグ、波括弧、入れ子。
- [Passing Props to a Component](https://react.dev/learn/passing-props-to-a-component): Propsの受取と表示、childrenでJSXを渡す組み合わせ。

確認日: 2026-10-06。採用依存はlock済みReact 19.2.7を維持します。公式資料の一般的なReact機能と、今回の純粋表示profileの許可範囲を区別します。

# Event・State・List/Keyの概念照合

- [Responding to Events](https://react.dev/learn/responding-to-events): handlerの関数を渡すこととbuttonによる操作。
- [State: A Component’s Memory](https://react.dev/learn/state-a-components-memory): useStateの値と更新関数、Hookの呼出し位置。
- [Queueing a Series of State Updates](https://react.dev/learn/queueing-a-series-of-state-updates): 同じ描画のStateと、純粋な更新関数を順に適用する違い。
- [Updating Arrays in State](https://react.dev/learn/updating-arrays-in-state): 元配列を保ち、spread・filter・コピーからの並べ替えを使う更新。
- [Rendering Lists](https://react.dev/learn/rendering-lists): map、操作後も保つ一意なKey、位置indexによる誤り。

確認日: 2026-10-07。文章・例は独自制作。依存pinは変更せず、新しい操作profileは同期clickと1つのStateに限定します。一般Reactの機能制限ではなく、この演習の安全な実行範囲です。

## Form・State配置（Issue #119）

2026-10-07に[入力とlabel](https://react.dev/reference/react-dom/components/input)、[共通の親State](https://react.dev/learn/sharing-state-between-components)、[State構造](https://react.dev/learn/choosing-the-state-structure)、[不要なEffectを避ける](https://react.dev/learn/you-might-not-need-an-effect)を照合。説明・課題・Hintは独自制作。サイト表示は19.3、実行と型はlockのReact19.2.7/@types19.2.17を維持する。固定Event型のSubmitEventを使い、deprecatedのFormEventを学習者の修正対象へ増やさない。
