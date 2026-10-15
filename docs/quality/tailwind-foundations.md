# Tailwindの基本・状態・レスポンシブ

Issue129は導入Lessonの後に、幅・余白・文字・色、操作状態、mobile-firstの3単位を加える。Courseは草稿を維持し、テーマとproduction buildはIssue130、学習パスへの追加と公開受入はIssue131で扱う。導入のIDとSourceは維持し、revision間は追加だけの空のprogress migrationを使う。

## 有限の実習入力

固定compiler 4.3.2、assetの内容/hash、opaque iframeとCSPは既存のままとする。buttonはtype="button"とdisabledだけを追加許可する。基本Utilityと単一variantの対応範囲は`content/tailwind/references/tailwind-official.md`に記す。未知の通常classは警告・compiler入力から除外し、任意Selector・連結variant・外部参照は拒否する。保存Sourceへ除外結果を書き戻さない。

## 描画の観測と実操作

`hover-style`はselector targetだけで使う。Snapshot policyのhoverSelectorsとhoverComputedStylesは省略可能で、要求対象は通常selector集合の部分集合、上限は64selectorと128propertyである。要求のある場合だけPreviewNodeのhoverComputedStylesを返す。Validatorは欠落時に通常Styleへfallbackしない。

Bridgeは通常Styleを先に取り、対象を1件ずつ一時的な状態Selectorへ対応させる。focusの観測は:focus-visibleと:focusを扱う。専用の状態観測を要求したSnapshotの間だけ、CSSOMの状態Selectorを同じ特異性の一時属性Selectorへ置き換える。Rule本体・入れ子・layer・media条件・cascade位置は動かさない。通常時は属性なし、状態観測は対象1件だけに属性を付け、実pointerやfocusの残りを混ぜない。観測後は例外時もSelectorと一時属性を復元する。hover非対応環境では未採点の環境エラーとし、media条件を解除して合格を作らない。この観測は実ポインターやキーボード入力の再現ではない。UA stylesheetや祖先のhover、focus-withinを含めた汎用的な状態再現は対象外で、教材の有限variantを扱う。別途実ブラウザでhoverの出入り、Tab/Shift+Tab、disabledの操作とfocus、767/768pxの境界を確認する。

通常色とhover色、通常outlineとキーボードfocusの輪郭を別々に判定する。常時暗色・常時outline・focus消失・見た目だけdisabled・早すぎるsm・固定幅・文字だけ白にする例を反例に持つ。数値幅/余白とfocus:の別解も受理する。classの文字列一致だけを描画の証拠にしない。

## 検証の所在

動作契約は`tailwindRunner.test.ts`、`validatorRuleSchema.test.ts`、`validatorRuleEngine.test.ts`、`createSrcdoc.test.ts`、`previewProtocol.test.ts`で確認する。`tailwind-foundations.spec.ts`は固定compilerで全新規Fixtureと全指定幅、通常UIで保存・再読込・Reset・判定、実hover/focus/disabled、PC/390pxの全新規Slideを扱う。既存導入は`tailwind.spec.ts`を維持する。内容レビューの承認は教材内容指紋へ結び付け、実操作レビューと区別する。
