## Source OrderとInheritanceで色を選ぶ

2つのRuleの順番だけを直し、Childへ届く色を観察します。HTMLと`.control` Ruleは変更しません。

1. 2つの.cascade-card Ruleを見比べます。
2. 後のRuleが橙色#9a3f25になる順番へ整えます。
3. Previewで`.message`がParentの橙色を継承したことを確認します。
4. 直接指定がある`.control`は青緑色`#2d5d62`を保ちます。

変更するのは2つの`.cascade-card` Ruleの順番だけです。`important`や別のSelectorは追加しません。
