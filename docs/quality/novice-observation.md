# 完全初心者Observation

- releaseStatus: `draft`
- participantCount: `0`
- requiredCheckpoints: `5`
- approvedCheckpoints: `0`
- guidedProjectStatus: `pending`
- capstoneStatus: `pending`
- unresolvedFindings: `0`
- status: `未実施（合格扱いしない）`
- verifiedSourceCommit: `ed9f1a6997149357ea329bcef6719e3476d31329`
- canonicalDistSha256: `d84d16c571d48e597c6d2f17078f34280742e310af9118e9b9d3d184e36afc78`
- participant: `未割当。実装者・教材authorではない完全初心者1名以上が必要`
- facilitatorPolicy: `口頭補助、正解誘導、実装者による代理回答を禁止する`
- bindingPolicy: `観察対象を最終source commitと/tsumucode/ canonical distへ固定済み。観察結果は未実施`

## 未実施の理由

この確認は、実装者や自動テストでは代替できない第三者の学習観察です。参加者の操作、発話、所要時間、teach-back、Project完成結果がまだ得られていないため、推測値や架空の結果は記録しません。全Checkpointの観察、必要修正、再確認が完了するまでRelease承認を保留します。

## 対象Lessonと現在のSource hash

| Checkpoint           | 対象Lesson                                                 | Source hash                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 導入とHTML基礎       | `ch00-l01`、`ch00-l02`、`ch01-l01`、`ch01-l02`、`ch01-l03` | `b94c4206e3d972c5b4d63d2494233f150b119f368d06c50b674ca88761971c5a`、`367a83fceeba85a0a1f50d2b0485db79146ced927fd94dea3c31291a264b5d8f`、`b9e9c1043aff374b8073d2be26cabce143727deb8902cf19bc5343f911567c68`、`6396a8f6b0507fa380c5464faa6cd18e74704cbf2939a8e266ae66cb501d5325`、`ef4c087c0e2779a9e438bfc5b28cf92747ffb4d3af21efc39da22a98fbbd49f4` |
| Phase 02終端         | `ch07-l01`                                                 | `d2323484dfc24a5202934b70c0ae2fca9b54273ae4e07418222d40d6b898c35e`                                                                                                                                                                                                                                                                                 |
| Phase 03終端         | `ch11-l04`                                                 | `195fd6262e9a986845488a2495e7d7fd1a29b027862a804bf287429c1f4999f9`                                                                                                                                                                                                                                                                                 |
| Guided Profile 5工程 | `ch12-l01`、`ch12-l02`、`ch12-l03`、`ch12-l04`、`ch12-l05` | `b915b713272fc8478e3da6da40cc0e492c44d3f8fba84606b96fbab037ce12fe`、`d70eec13532a057f56c0f2dd87c2debee77f9f05a1337e78961a33953f53f9d7`、`eca3158d0fc9821dd4c76b16905f4551e3ee6ddec40756e18a4ee4a4d0ed42da`、`c06ee414b955ce491750eff1f3e34b463fac8005d7e24e6deac468206c9b21dc`、`a6c3f633d3e514d4820a91058714e7c6df4cbb49a4d19149a3d7a51953c47ed0` |
| STACK DAY Capstone   | `ch13-l01`                                                 | `3de0fcd01111cc0981f91b762a5a6bb5fef9848453807da3d2793d8b59408b9d`                                                                                                                                                                                                                                                                                 |

## 実施条件

- 氏名、メールアドレス、実データはRepositoryへ記録しない。参加者IDは匿名の連番にする。
- 初回利用の端末とブラウザ、Viewport、支援技術の有無を記録する。
- Chapter 00–01、Chapter 07、Chapter 11、Guided Profile 5工程、Capstoneを口頭補助なしで進める。
- 各Checkpointで「何を学んだか」「なぜそのHTML/CSSを選んだか」「次に何をすると思うか」を参加者自身の言葉で説明してもらう。
- CapstoneはSolution、DOM Tree、CSS Property、完成手順を見せず、Briefだけから完成させる。
- 迷った画面、誤解した用語、進行不能、誤操作、ヒント利用箇所を時刻とともに記録する。
- 教材またはUIを修正した場合はLesson source hashと独立教育レビューを更新し、同じ参加者または別の完全初心者で再確認する。

## 観察記録

| Checkpoint           | 実施日 | 環境 | 所要時間 | 迷った画面 | 誤解した用語 | 次操作の認識 | Teach-back | Project結果 | 修正 | 再確認 | 判定 |
| -------------------- | ------ | ---- | -------- | ---------- | ------------ | ------------ | ---------- | ----------- | ---- | ------ | ---- |
| 導入とHTML基礎       | 未実施 | —    | —        | —          | —            | —            | —          | 対象外      | —    | —      | 保留 |
| Phase 02終端         | 未実施 | —    | —        | —          | —            | —            | —          | 対象外      | —    | —      | 保留 |
| Phase 03終端         | 未実施 | —    | —        | —          | —            | —            | —          | 対象外      | —    | —      | 保留 |
| Guided Profile 5工程 | 未実施 | —    | —        | —          | —            | —            | —          | 未実施      | —    | —      | 保留 |
| STACK DAY Capstone   | 未実施 | —    | —        | —          | —            | —            | —          | 未実施      | —    | —      | 保留 |

## Release判定

- 進行不能: `未確認`
- 説明不能: `未確認`
- 未修正の誤操作: `未確認`
- 2 Project完了: `未確認`
- 総合判定: `保留`
