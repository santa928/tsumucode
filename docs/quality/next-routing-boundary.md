# App RouterとServer/Clientの2 Lesson（Issue #133）

未公開Next Courseに`next-ch02-l01`と`next-ch02-l02`を追加する。
前提は最初の通常Lesson #132。Course全体の正式公開、cache、Server Actionは含めない。

## 学ぶ動作

l01はpage/layout、nested layout、Promiseのparams、2つの動的値、実URLの
直接アクセス・再読込・通常aによる文書遷移を扱う。Next Linkのsoft navigationとは
区別し、今回はそのprefetchや共有layoutの状態保持を実測したとは扱わない。

l02はServerのNode処理・asyncと、ClientのHook・clickを分離する。
Serverからnumber/stringのpropsを渡し、初期2→3→4を実Browserで確認する。
Server Hook、Client Node依存、普通の関数propsの負Fixtureを実build/診断で検査する。
型検査で先に拒否される失敗と、devでの境界エラーも区別する。

各Lessonは4 Slide、表示や動作を予測するpractice、修正課題、Hint3、Solution、
正負Fixtureを持つ。既存の共通Workspace/Source/CAS/Lease/JSONと固定Next imageを使う。
固定Workspaceごとにファイル集合・表示URL・独立grader目標を対応させる。
別教材のファイル、未知設定、古いsource hash/runを受け付けない。

旧revision `2026-10-08.1` の進捗とJSONは `.2` へ移行する。
既存Lessonの合格・Draft・過去の合格Sourceは保持し、追加Lessonが未完ならCourseの
現在完了だけを解除する。複数revisionのmapは全移行後に現在のLesson集合へ照合する。

## 実行境界

learnerは#132承認済みのCPU1、RAM/swap512 MiB、PID64、tmpfs各64 MiB、
nonroot、readonly rootfs、network:none、cap dropを維持する。
管理/ViteのCSPや資源は変更しない。Next限定unsafe-evalと固定chunk2 MiBを維持する。

ルーティングLessonだけで追加が必要な固定URLはtrips、trips/forest、trips/sea。
この追加は2026-10-08の本人承認に基づく。未知slug/query、RSCヘッダー、Cookie、POST、redirect、
任意_next経路、外部通信を増やさない。すべて同じrun専用originのGET/HEADに限定する。

作者用production build検査はlearnerとは別のオフラインimageで実行する。
SolutionやFixtureをlearner/web/graderへコピーしない。
作者用buildはRAM/swap2 GiB、CPU2、PID256、workspace tmpfs128 MiBであり、
この成功をlearnerの資源内でproduction buildできる根拠にはしない。

`node:path` は固定Turbopack devでClientからの利用が成功する一方、webpack buildでは
拒否されたため、Node専用moduleの負Fixtureにはファイル操作の `node:fs` を使う。
普通の関数propsはdevでClient境界の診断を確認する。production buildは先に
TypeScriptのprops型不一致で拒否され、同じ診断順序とは扱わない。

## 検証と保全

既存l01の4fileとhash・判定を維持する。新Workspace混入拒否、保存/reset/CAS、
metadata対応、表示・操作・リンク、異常後の修正、停止/再開、端末JSONを検証する。
新しい固定経路はルーティングLessonだけで許可し、別Workspaceでは拒否する。
生ログ・画像・作業記録は作者用の非公開保存先へ置き、公開pushに含めない。

採点器は実HTTP200の文書応答、直接アクセス、実reload、操作結果を観測する。
各文書はload完了後にURL・mainFrame・文書要求数・遷移数を照合し、遷移ごとの
追加networkidle待機は課さない。全体10秒の期限と異常終了時のrun回収は維持する。
全体期限超過は基盤503として区別し、実行の開始し直しを案内する。
採点後のmarker確認中も実文書要求とURL変更を監視し、同一URLのreplaceStateは
切替に数えない。同じURLへのreloadや、別URLへ移って戻る操作は切替として検出する。
予定した遷移が完了した時だけ文書phaseを更新し、DOM読取やclickの間の文書切替は
採用しない。詳細pageの500・操作期限超過は教材の `code-error` として返す。
Nextの同URLへの履歴更新と、実文書の再読込は別々に検出する。

`next-observations-acceptance.mjs` は作者用HTTPを実Browserで開き、通常文書遷移の
合格、historyだけの偽遷移の不合格、イベント中の文書切替の拒否を検査する。
これは採点器の負例検証であり、Next教材そのものの実行証拠には代用しない。
CIでは作者用imageの実行UIDを1000へ指定し、専用tmpfsの所有UIDと揃える。
readonly rootfsとnetwork:noneのまま、Browserの一時領域だけを書き込める。

各予測は答えと理由を折り畳み、予測してから開示・実測と比較する。境界Lessonはuse clientがないCounterの診断から修復し、pageのasync/Node処理をServerへ残す。境界修復後に初期値とclickを直す。
