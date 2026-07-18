## Source OrderとInheritanceで色を選ぶ

同じSpecificityのRuleの順番を直し、Childへ継承される色を予測します。

1. 2つの.cascade-card Ruleを見比べます。
2. 後のRuleが橙色#9a3f25になる順番へ整えます。
3. .messageはParentの橙色を継承させます。
4. .controlは直接指定した青緑色#2d5d62を保ちます。

importantは使いません。どのRuleが直接届き、どの値が継承されるかを確認しましょう。
