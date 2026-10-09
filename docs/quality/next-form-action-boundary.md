# FormとServer Actionの2 Lesson（Issue #135）

未公開Next Courseに`next-ch04-l01`と`next-ch04-l02`を追加する。
React/TypeScriptと既存Next Lessonを前提に、入力検証・一時失敗・同じ内容の再試行を扱う。
外部DB・認証サービス・依存・通信・費用は追加せず、Courseはdraftを維持する。

## 学習とSource

FormはClientのHTML入力制約とServer側のtrim・3〜40文字検証を分ける。
実JSON POSTの400/503/200と、入力に対応した結果・保存回数を読む。
Actionは`useActionState(saveNote, initialState)`の戻り値と、Actionの`previous, formData`を分ける。
previousは前回の戻り値で初回はinitialState。実multipart POSTがHTTP200でも、
invalid/failed/savedを区別する。controlled inputで失敗後の値を保持し、pending中は
入力と送信を無効にする。入力を変えたら以前の保存結果を現在の結果として表示しない。

読み取り専用の保存先は同じlearner内の有限メモリに保持する。内容ごとの初回有効入力は
一時失敗し、同じ内容の再送で保存する。永続DBではなくSource反映・停止再開で初期化する。
Previewの履歴は最大32件で、採点は別の1件を使い、Preview履歴をresetしない。
各Lessonは概念Slide3・checkpoint1・変更Step3・Hint3・Solution・正負Fixture9を持つ。
ServerファイルとClient formだけを編集対象とし、layout/page/CSS/state/store helperを固定する。

## 有限POSTの境界

本人承認済みの公開POSTは次の2教材だけとする。

| Workspace         | 公開POST            | 形式                                                   |
| ----------------- | ------------------- | ------------------------------------------------------ |
| next-ch04-l01-e01 | 同じrunの`api/note` | `application/json`                                     |
| next-ch04-l02-e01 | 同じrunのroot       | 固定Browserのmultipart・42桁Action ID・固定router tree |

Actionのdocumentには末尾slashがある。document rootとcanonical rootの2表記を同じpageとして
認め、未知path/query・内部store/controlを公開しない。Host/Originは現在runへ完全一致し、
Origin欠落/nullを拒否する。Viteの固定native echoに限るOrigin:null例外は適用しない。
Cookie・Authorization・管理token・Forwarded・採点相関IDを公開Proxyの転送allowlistへ入れない。
CSP・no-store・nosniff・Set-Cookie/redirect抑止・sealed socketとinode照合を維持する。

本文64KiBは全量受信後にだけ上流へ送る。公開POSTの応答512KiB・全体30秒・同時HTTP8を維持する。
途中切断・期限・Source/run変更では上流を回収する。headers送信後の失敗では接続を閉じ、
二度目のheadersを書かない。承認済みAction RSCだけを逐次送信する。
既存Next/Viteの許可経路や資源上限を広げない。

## 採点と競合

trusted Browserは空白の検証エラー→初回一時失敗→同じメモの保存を実際に送信し、
HTTP全量完了・可視DOM・保存履歴を照合する。固定成功表示やHTTP200だけでは合格にしない。
全体10秒の採点期限を維持し、前後のrun/revision/hashと文書版を一致させる。

readonly native backendで、exactメモ・ランダムlease ID・run・Source版を結び付ける。
inspect/releaseも同じID・版を要求し、古いfinallyが新しい予約を消さない。
相関IDは管理資格情報ではなく、trusted bridge→Native検査→同じServer helper間だけで使う。
storeへの要求開始時に一致したleaseオブジェクトへ帰属させるため、切断済みPreview処理が
後から保存先へ到達しても採点のinvalidCalls/attemptsを変更しない。
一致しないメモや似たprefixを採点枠へ入れない。

新しいPreview POSTは採点中に拒否する。既に送信中なら予約は409で返し、正常runと送信を維持する。
期限切れ予約は15秒で失効し、Source反映・停止でも破棄する。制御経路はBrowser Previewへ開かない。
編集可能なServerコードが自分の隔離内のloopbackに接続できる境界は維持し、
自分のServerからも制御経路に絶対到達できない、という権限保証は主張しない。

## Dockerと検証

固定Node24.18.0・Next16.3.8・React19.2.7を再利用する。新2教材のRAM/MemorySwapは512MiB、
CPU1・PID64・tmpfs各64MiB・network:none・非root・readonlyを維持し、追加swapは許可しない。
保存先は常駐bootstrap内で処理し、追加learner Nodeを起動しない。
Form/ActionのNext childはheap128MiB・semi-space4MiBに限定する。
採点診断は固定段階と経過時間だけを記録し、Sourceや入力内容を出力しない。

`next-project-acceptance.mjs`は各9正負Fixture、Source409、停止・再開、grader回収、native資源を確認する。
`next-routing-browser-acceptance.mjs next-ch04`は通常Slide・編集・実送信・Keyboard・入力保持・
Preview履歴保持・修正回復・版失効・a11y・narrow・下書き・端末JSON移送を確認する。
`next-form-http-acceptance.mjs`は実ProxyのOrigin/資格情報/本文・応答・期限・
送信中採点409・Source反映/停止の中断を確認する。
production buildは`next-build-acceptance.mjs next-ch04`で新2教材だけを選んで確認できる。
CIでは既存教材を含む標準の全ケースを通す。

#136の持ち出しProjectと#137の全Course公開は別ゲート。今回のdev実行を正式公開や
外部DBへの永続保存の証拠にはしない。

## Source反映の期限と診断

NextのSource反映はpause・固定exec・実HTTPの版確認を合わせて既存startup上限20秒以内で行う。各段階は同じ絶対期限の残りを使用する。Browserとwebの対象apply APIのみ25秒待ち、採点10秒と公開POST30秒、RAM・隔離・版の照合は維持する。

反映失敗はrunを回収し、保存Sourceを保持する。controllerは固定phase（pause/exec-create/exec-start/exec-inspect/ready）とreason（deadline/socket/HTTP/identity/exit/unknown）のみを記録する。Source・例外本文・資格情報は出力しない。過去のWeather反映503の原因は未確定であり、再実行成功だけを原因解消の証拠としない。

採点の期限診断では、10秒で結果の受理を禁止してから、所有graderの固定phase進捗を最大200msで採取して回収する。200msは診断取得の上限であり、採点期限を延長しない。コンテナ回収は既存のDocker API期限内で行い、200ms以内の完了を保証しない。実POSTのheaders/body/DOM、Browser終了と予約解放を区別するが、本文・メモ・header・予約ID・Source・例外本文は記録しない。停止やSource変更の通常cancelには診断待ちを追加しない。

Form採点は実POSTの全量完了・可視state・保存履歴で準備と結果を確認するため、networkidleの固定500ms待機を重ねない。他教材の文書静止契約は維持する。8秒以上の採点ではDocker起動を含む全体時間と固定phase進捗だけを記録し、10秒への余裕を判断できるようにする。過去Action UIの超過段階は未確定で、今回の変更だけで原因解消と断定しない。
