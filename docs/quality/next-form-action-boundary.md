# FormとServer Actionの2 Lesson（Issue #135）

Issue #135では、当時未公開だったNext Courseへ`next-ch04-l01`と`next-ch04-l02`を追加した。
React/TypeScriptと既存Next Lessonを前提に、入力検証・一時失敗・同じ内容の再試行を扱う。
当時は外部DB・認証サービス・依存・通信・費用を追加せず、draftで検証した。
現在の9教材は公開済みであり、この文書の限定Cookie基盤はCookie専用Lessonや追加公開の完了を意味しない。

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
Authorization・管理token・Forwarded・採点相関IDを公開Proxyの転送allowlistへ入れない。
Cookieは後述の固定themeだけを例外とし、CSP・no-store・nosniff・redirect抑止・sealed socketとinode照合を維持する。

## 承認済みの固定Cookie境界（#137）

この2教材のdocument読取と既存POSTに限り、`lesson-theme=light`または`lesson-theme=dark`を転送する。
他名Cookieは除去し、同名重複・補正が必要な値・壊れた構文はCookieなしとして扱う。
Set-Cookieは成功した既存POSTだけで許可し、session setと明示的な期限切れdeleteを再生成する。
Domain指定・任意Path・永続期限・未知属性・同名重複は採用しない。出力は常にhost-only、
`Path=/w/<workspace>/<run UUID>`（末尾slashなし）、`HttpOnly; SameSite=Strict`とする。
static chunk、HMR/WebSocket、他のNext/Vite教材、採点にはこの例外を適用しない。

Cookieはrun単位で分離する。同じrunのSource反映では保持し、停止後の新runには引き継がない。
旧CookieがBrowserに残っていても、新runのhost・Pathとは一致しない。
固定2教材の成功POST応答はCookieの有無にかかわらず、headers発行直前に
run・Source版/hash・socket dev/inode・非採点を確認し、
確認時点で失効していた応答とcontrol不通を拒否する。既にBrowserへ送ったheadersは撤回できず、
同run内のSource版ごとのCookie完全初期化や、HTTP完了とCookie保存の原子性は保証しない。
既存の採点器はCookie演習の合格判定を提供しない。

Strict Cookieは埋込み画面の第三者Cookie制限で使えない場合がある。
埋込みで実際に保存・読取できない場合だけ、対象2教材の案内から同じrunのPreviewを別タブで開く。
ブラウザ設定や管理originの変更、SameSiteの緩和は行わない。
learnerのJavaScriptが自分のoriginへ任意の非HttpOnly Cookieを書くことを全面禁止する契約ではなく、
Proxyの入出力制限と管理host・新runへの分離を保証する。
新しいCookie専用Lessonや正式公開はこの基盤変更に含まれない。

`next-form-cookie-browser-acceptance.mjs`は作者専用Sourceで実Nextの`cookies()`を呼び、
Browserの自動Cookie送信によるset/read/delete、埋込みの成否、必要時の別タブ、
HttpOnly/Strict/host/Path、同runの反映保持、新run分離と他名Cookie遮断を確認する。
手動CookieヘッダーやAPIRequestContextのjarを成功の代用にしない。
API仕様は[Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies)、
host/pathの意味は[RFC 6265](https://www.rfc-editor.org/rfc/rfc6265.html)を参照する。

本文64KiBは全量受信後にだけ上流へ送る。公開POSTの応答512KiB・全体30秒・同時HTTP8を維持する。
途中切断・期限・Source/run変更では上流を回収する。headers送信後の失敗では接続を閉じ、
二度目のheadersを書かない。固定Action POSTのRSCは正常EOFまで全量検査し、
送信直前に許可を再確認してからContent-Length付きで渡す。途中結果やSet-Cookieを先行公開しない。
Form・文書GET・Weatherの転送方式は維持する。
既存Next/Viteの許可経路や資源上限を広げない。

## 採点と競合

trusted Browserは空白の検証エラー→初回一時失敗→同じメモの保存を実際に送信し、
HTTP全量完了・可視DOM・保存履歴を照合する。固定成功表示やHTTP200だけでは合格にしない。
Actionの完了はtrusted bridgeが付ける送信連番1→2→3と、実ResponseのURL・method・statusを
厳密に対応させる。正常な上流EOF・下流送信完了に加え、対応するDOMとreadonly履歴を要求する。
部分stream・旧送信の完了・切断・上限超過・対象POSTのBrowser中断を成功として扱わない。
公開Proxyと採点器内の固定Action POSTは、512KiB以内のRSCを正常EOFまで受信し、Content-Length付きで
Browserへ渡す。採点器のBrowser側では固定Action POSTのResponseのcloneを正常EOFまで読み、
実byte数とContent-Lengthを照合してから、元ResponseをNextのdecoderへ渡す。
元ResponseのURL・type・redirected・未消費body、fetchの引数・signalを保持し、再試行しない。
通常UIのfetchやdecoderには採点用の全量読取処理を追加しない。
固定350msの保存待ち・pending検査は維持する。
全体10秒の採点期限を維持し、前後のrun/revision/hashと文書版を一致させる。
Form観測中の文書版を基準更新で消さず、同URLのreplaceStateは許可し、実reloadは拒否する。
最大8POSTのCDP受信量は診断だけに使う。header欠落はunknownとして残し、本文・URL・入力値を
保持しない。Browser側とtrusted bridge側の連番を区別し、raw headerの到着順が変わっても
byte数と終端状態を維持する。終端時とBrowser終了前に出す同じrequestの記録は最新値として読む。

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
`next-form-drain-acceptance.mjs`は実HTTPでBrowserの512KiB正常EOF、部分切断・signal中断の拒否、
不正応答の拒否、元Responseとfetch入力の保持、対象外GET/queryを変更しないことを確認する。
production buildは`next-build-acceptance.mjs next-ch04`で新2教材だけを選んで確認できる。
CIでは既存教材を含む標準の全ケースを通す。

#136の持ち出しProjectと#137の全Course公開は別ゲート。今回のdev実行を正式公開や
外部DBへの永続保存の証拠にはしない。

## Source反映の期限と診断

NextのSource反映はpause・固定exec・実HTTPの版確認を合わせて既存startup上限20秒以内で行う。各段階は同じ絶対期限の残りを使用する。Browserとwebの対象apply APIのみ25秒待ち、採点10秒と公開POST30秒、RAM・隔離・版の照合は維持する。

反映失敗はrunを回収し、保存Sourceを保持する。controllerは固定phase（pause/exec-create/exec-start/exec-inspect/ready）とreason（deadline/socket/HTTP/identity/exit/unknown）のみを記録する。Source・例外本文・資格情報は出力しない。過去のWeather反映503の原因は未確定であり、再実行成功だけを原因解消の証拠としない。

採点の期限診断では、10秒で結果の受理を禁止してから、所有graderの固定phase進捗を最大200msで採取して回収する。200msは診断取得の上限であり、採点期限を延長しない。コンテナ回収は既存のDocker API期限内で行い、200ms以内の完了を保証しない。実POSTのheaders/body/DOM、Browser終了と予約解放を区別するが、本文・メモ・header・予約ID・Source・例外本文は記録しない。停止やSource変更の通常cancelには診断待ちを追加しない。

Form採点は実POSTの全量完了・可視state・保存履歴で準備と結果を確認するため、networkidleの固定500ms待機を重ねない。他教材の文書静止契約は維持する。8秒以上の採点ではDocker起動を含む全体時間と固定phase進捗だけを記録し、10秒への余裕を判断できるようにする。過去Action UIの超過段階は未確定で、今回の変更だけで原因解消と断定しない。
