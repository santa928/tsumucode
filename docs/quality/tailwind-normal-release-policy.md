# Tailwindの正式公開契約（Issue #131）

TailwindはHTML/CSS直後に選べるrecommended Courseです。未開始・未完了でもJavaScript、TypeScript、React、Nextのrequired Courseへ進めます。公開契約の登録だけでは公開を許可しません。現在のCourse、正式承認、公開候補、技術受入はdraftで、Pathには未追加です。

## 草稿で確認した証拠の再利用

`tailwind-release-preparation.yaml`と私有の`technical-verification.json`は、Source `37e689387f75bc7060739369977e7b7b8df93700`、固定dist `49baf318459ba8d625436b2d788b4a5ffea1acf90e93c679031525f05329b9e3`の5教材に対する草稿受入です。元のSource、dist、観測方式、未確認項目を保持します。公開契約の追加後に旧草稿checkerを実行し、別Productを同じ候補と扱うことはできません。

正式公開の`tailwind-release-acceptance.yaml`では元候補、元品質記録のbytes hash、技術検証原本、元の独立原本照合を別々に固定します。新しい公開Sourceの3観点code reviewと、そのうち1名による全参照の独立照合が必要です。私有原本は公開repoやPages artifactへ含めません。

`tailwindPublicationInputs.ts`は元Source、公開Source、現在の教材・実行・画面・配布入力を比較します。正規化するのは公開状態、説明中の草稿表記、固定release台帳のauthoring登録とProvenance、HTML/CSS直後のrecommended登録だけです。教材、revision、前提、後続required、UI、Compiler、Runtime、固定依存は変更できません。別の教材改善が必要なら、影響する観測を再取得します。

## 公開候補を固定する順序

1. 本人の公開許可と、Tailwindへ適用できるcomputer use代替承認の原文・参照を確認する。独立AI操作を実人の学習効果・物理端末測定と記録しない。
2. 5教材の既存技術原本を保ち、`publicationStatus: published`とfrontendのHTML/CSS直後のrecommended登録を候補に加える。JavaScript以降の前提は維持する。
3. 公開Sourceをcommitし、固定Docker内で対象内容レビュー・保存互換・表示導線・必要な品質検査を行う。元入力と公開入力の正規化hash一致を確認する。
4. 公開候補のdistを計測し、3名review・全原本照合を記録する。内容レビュー、技術受入、承認、候補台帳のSource/tree/dist/Manifest/Provenanceを固定する。未確認をdraftのまま承認扱いにしない。
5. 既存Pagesの`tailwind` candidateを使用する。betaによる承認省略は拒否する。HTML/CSS、JavaScript、TypeScript、React、Next、Python基礎の既存保存互換と必要なNext native CIも維持する。
6. 配信後に実URLのSHA、開始・再開・採点・保存・Export・別状態Import、recommended導線、持ち出しproduction buildを確認する。固定revisionの公開後記録を作成し、tag/Report/配信run/Artifactと結んでから履歴へ昇格する。

`TailwindPostDeployVerificationSchema`は上記8操作、未確認0、Environment admission・公開URL・Report・tagの成功を必須にします。独立Environment approvalは現在未設定であることを保持します。必要CIが失敗している間、公開やIssueのcloseを完了扱いにしません。

初心者向け独立CUAは5教材の操作範囲として保持します。ZIPクリックが未確定だった観測を成功に書き換えず、正式CIで得たZIPの別Docker production buildの確認範囲と区別します。
