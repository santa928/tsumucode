# React Reducer・Context教材の有限契約

Issue #120の2単元は更新ルールと値の取得を分ける。ReducerはState/actionから純粋な次Stateを返し、Contextは親Providerの値を読む。短い経路ではPropsも適切であり、全ComponentのContext化を正解条件へ広げない。Courseとレビュー台帳はdraftのまま。外部状態管理lib・Effect・Custom Hook・正式公開は含まない。

## 固定WorkspaceとAPI

`reducer-form-v1`は`reducer.ts`だけを編集する5File。`components.tsx`の唯一のuseReducer、同期入力・送信取消・3actionのdispatchと表示を固定する。`context-sharing-v1`は`components.tsx`だけを編集する5File。唯一の親useState・Provider・2consumer・Resetをmain.tsxへ固定し、nameContext.tsは同じContextの宣言だけを持つ。依存方向はmain→components/nameContext、components→nameContextで循環しない。型・起動・HTMLと全File集合はCompiler・保存/Import・採点の同じ契約で保護する。

Reactと型のlockは19.2.7/19.2.17を維持する。信頼済み自己完結bundleのexportは既存5個にuseReducer/createContext/useContextを加えた8個。importはprofile/File別に限定し、新APIを旧profileへ開放しない。新Reducerの実取消観測だけを既存dom-formへ結び、通知・JS能力・timeout・予算を広げない。

## 学習条件と実操作のAND

Reducerは元Source全体の2048node上限、型抑制/任意call/代入/loop等を検査したうえで、既知3actionの有限ASTを追う。最大8192回の分岐検査に制限する。if/switchと型/import/変数alias、純粋なobject・spread・local値を受理し、action.nextName→次name、送信時の元state.name保持、resetの空nameと各attemptedを確認する。内部由来はSymbolで表し、同名文字列の固定回答では偽造できない。同じStateの返却とmutationを合格へ数えない。純粋性・3actionの由来・fresh objectの厳密5fact、元Sourceの実TS compile、全入力・送信・Reset操作をANDにする。

Contextは元Source全体を検査してから、唯一の固定useContext import/binding、同じNameContext、2consumerの先頭Hook、純粋なnullguardを確かめる。消すguardは同じ変数のnullとのstrict等値と、属性やJSX式のないpの案内だけ。import・Hook・localのshadowing、余分Context/Stateや宣言を拒否する。同期const arrowのwrapperも全条件を確認し、同じ元bodyを既存handler検査へ渡す。未接続handlerの副作用も検査する。

検査済みconsumerをProps経路へ正規化し、既存Form検査の実入力・更新callback・要約・文字数の由来を再利用する。固定Providerの同一性を足場で確認し、元Sourceをそのまま実compile/React実行する。正規化Sourceのline/columnを元Sourceの診断へ転記しない。実TS診断のみ元の位置を持つ。厳密3factと全兄弟操作をANDにする。

Source hashとsession/revisionの認証、型成功とDOM採点の分離、全Scenario/全checkpointの一致は維持する。学習RuleのtargetはReducerだけreducer.ts、他goalはcomponents.tsx。失敗案内は各goalの実検査条件へ結ぶ。

## 検証と保存

正負Fixtureは純粋更新・switch/alias・stale submit/reset・mutation/副作用・誤型、Contextの同取得経路・alias/trim・固定表示/文字数・guard副作用・余分State・shadowing・Event例外を扱う。実Worker/Compiler/React/Scenario/Validatorでstatus・診断・失敗Rule IDを確認し、元Event例外と次run回復、Source不一致と足場改変拒否を確認する。

通常UIではlabel・native input Enter・送信取消・aria-invalid・Keyboard Hint/focus・全文Source保存/再読込・判定・Resetを確認する。Reactの一時Stateは保存せず、保存Sourceを新しいrunで初期値から描画する。旧revisionからの空migration edgeでSource・履歴・Hint・cursor・passingSnapshotを保持する。390pxでは各SlideとPC案内を確認し、画像自体の独立レビューを行う。

成功数と未実施を最終PRへ記録する。初回失敗を成功へ数えず、旧入力で有効な成功証拠を理由なく繰り返さない。親画面のaxeと隔離iframe内の操作・表示検証を区別し、独立読解レビューを独自再実行と表現しない。人の初心者試用・物理実機・全Course完成・正式公開はこの子Issueの受入へ読み替えない。
