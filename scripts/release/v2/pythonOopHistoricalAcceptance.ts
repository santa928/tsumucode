import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { compileCourse } from '../../content/compileCourse';
import { computeLessonSourceHash, verifyReviewLedger } from '../../content/verifyContentReview';
import { hashBytes, hashValue, repositoryEnvironment } from './identity';
import { buildInventory } from './inventory';
import { CommitSchema, DigestSchema, IdSchema, InventorySchema } from './schema';
import { readInventoryAtSource } from './sourceInventory';

const exec = promisify(execFile);
const reviewPath = 'docs/quality/content-review-python-oop.yaml';
const policyPath = 'docs/quality/content-v2-receipts.json';
// この固定歴史案件だけを照合する。宣言は内容receiptや公開権限を与えない。
const pinned = {
  schemaVersion: 1,
  status: 'proposal-not-a-content-receipt',
  courseId: 'python-oop',
  sourceCommit: '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931',
  sourceTree: '85b143b26b35aaeb68ce11df1b8b16729a6ab966',
  courseTree: '84d280595c7584f9a71b5acc4a4471ddcf649c64',
  candidateReference: '9821a4eb16b7395ccf94bfbb59f467507bca97b3',
  historicalDistTreeSha256: '285276bd94e3a32dcc4ef81914fa2a50500e34dc1aafe02d34773e2b5062ef4f',
  uiObservation: {
    actorCount: 3,
    method: 'parent-direct-report-of-independent-computer-use',
    observedLessonIds: ['python-oop-ch01-l01', 'python-oop-ch04-l01'],
    independentChildImagesInspectedHere: false,
    inferredActorRoleReceipts: 0,
    completeAllLessonThreeRoleClaim: false,
    observedAfterByActor: {
      first: null,
      recovery: '18:49以降の新実操作との親報告',
      narrow: null,
    },
    exactObservationTimestamp: null,
    confirmed: {
      first: ['具体的出力と2変更・全体判定の説明', '初回演習への直接再開とコード保持'],
      recovery: [
        '初回演習の保存・Course再開・reload',
        '開始直後停止から再実行・判定合格',
        '合格後編集時の達成記録保持と再判定案内',
      ],
      narrow: [
        '390×844でProjectのCourse戻りEnter',
        'Brief展開・読書・Space折畳',
        '開発語整理・説明dialogのEscape後focus復帰',
      ],
    },
  },
  unverified: [
    'original-independent-child-cua-images',
    'exact-observation-timestamp',
    'all-nine-lessons-by-three-ui-roles',
    'all-project-implementation-and-grading-by-personas',
    'long-running-execution-stop-and-browser-exit-restore',
    'real-human-learning',
    'physical-mobile-and-touch',
    'voiceover-and-all-tab-sequences',
    'current-ui-runtime-and-candidate-dist',
    'publication-and-post-publication-operations',
  ],
  reviewedSources: [
    {
      reference: 'issue148-reviews.json',
      sourceCommit: 'f28f791456281c10c6422f77485136ad5573bbab',
      sourceTree: '62beeebc235d1a660eb370c8ccd72ac2e78a429e',
      mergeCommit: '8ada69d17628dc42f342340443859fe661b589e1',
    },
    {
      reference: 'issue149-reviews.json',
      sourceCommit: '4708bfd98d57a3e110813cfa1e176db7848babbe',
      sourceTree: '2bf7473324cc3008ba0b32752296b2cab350d47d',
      mergeCommit: '0db4ba2ecf98bdde1898e9a1021f607495ea3316',
    },
    {
      reference: 'issue150-reviews.json',
      sourceCommit: '6f6b5704e00e7c188fd711757bbad631f05af2b5',
      sourceTree: 'c819e3229a285b573c5937d2942407ed47eedaa2',
      mergeCommit: 'ccdbcfdd2042d9066a06e9d2c53a32fe58b85a86',
    },
    {
      reference: 'issue151-reviews.json',
      sourceCommit: 'b34ac7c56a423942650e0d412573c28877ac5e9a',
      sourceTree: '9e631d193d8233a2fa2e641a7eba1860d7b47d9d',
      mergeCommit: '2f623fd8c44acf2e6409c09165a776d9373c5302',
    },
  ],
  publicReferences: [
    {
      sourceCommit: '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931',
      path: 'docs/quality/content-review-python-oop.yaml',
      bytes: 7654,
      sha256: 'fadaf49a17771e73a5965a65158b8881016f758f4465a8591e6f6b47de6be98c',
    },
    {
      sourceCommit: '9821a4eb16b7395ccf94bfbb59f467507bca97b3',
      path: 'docs/quality/content-review-python-oop.yaml',
      bytes: 7654,
      sha256: 'fadaf49a17771e73a5965a65158b8881016f758f4465a8591e6f6b47de6be98c',
    },
    {
      sourceCommit: '87296dd27654455c16212e41a68c106021c72ef9',
      path: 'docs/quality/python-computer-use-acceptance.md',
      bytes: 17217,
      sha256: 'c2cb60e49161a5baf4a17b4a7d49009b5ff298a18b233ae7aaf9280a8f327eb6',
    },
    {
      sourceCommit: '9821a4eb16b7395ccf94bfbb59f467507bca97b3',
      path: 'docs/quality/python-oop-course-acceptance.md',
      bytes: 17080,
      sha256: 'd899e15458bda1c8406039241c82414d6dc767879184de06a670bc61c77ddeed',
    },
    {
      sourceCommit: '9821a4eb16b7395ccf94bfbb59f467507bca97b3',
      path: 'docs/quality/content-v2-receipts.json',
      bytes: 4390,
      sha256: '1b362557a35d50d7e619e0517480895ef9bacf179e3c39acff9f56b90ff4c76c',
    },
  ],
  privateReferences: [
    {
      path: 'issue148-handoff.md',
      bytes: 4322,
      sha256: '1a5d3eeafeb99025390a71e3b00ab5b8a28896b632ce0b3d8ccbb44909e5f815',
    },
    {
      path: 'issue148-reviews.json',
      bytes: 534,
      sha256: 'e5007a38c2772fe43aa68571b67380cb942f5749806a1befef174c9e199849f3',
    },
    {
      path: 'issue149-summary.json',
      bytes: 2784,
      sha256: '1d06be417a2cfdd3b05d72c39ab80192770095c5c0ba237aebe0b08f80dcd15d',
    },
    {
      path: 'issue149-reviews.json',
      bytes: 414,
      sha256: '3036e1b05ed80ad384e32dd5d61b6b6fdd2d13b3bfb5d04d62d85034fcc02386',
    },
    {
      path: 'issue150-handoff.md',
      bytes: 8071,
      sha256: '86a693dd231a09e25acb21fea3300197d1610db9c8d2752045ef1a925f83f34f',
    },
    {
      path: 'issue150-reviews.json',
      bytes: 414,
      sha256: '883ee6bc55aa8115235b648ceef783b79f8cbba890468c88c6b2c3bff2ee65f3',
    },
    {
      path: 'issue151-handoff.md',
      bytes: 11374,
      sha256: '5a37369c2333c229dde484bd13a64619f69838f7ce0603fe16623bf43e90807b',
    },
    {
      path: 'issue151-pre-budget-reviews.json',
      bytes: 580,
      sha256: '0728d9a03b4464588dfa1842fb80ca6c5098088ae475259370c5389ca829e540',
    },
    {
      path: 'issue152-summary.json',
      bytes: 7223,
      sha256: '43dcf2d331d46c1e45fc7a75333c3041edd82d39b5616d9d3cc0e3d32183f4b1',
    },
    {
      path: 'issue152-source.json',
      bytes: 3491,
      sha256: '1ce9c65abac54557abc020f057866157bba73135722590c5db710e185ee68a31',
    },
    {
      path: 'issue152-artifact.json',
      bytes: 621,
      sha256: 'b3ffb32a6e7d31f8743ed9f1f946db982f3cc38cff6fef4daed086f055d2d9eb',
    },
    {
      path: 'cua-parent.json',
      bytes: 2298,
      sha256: '31be88f9c5a29167a5a6913c760f2cd0b71e92268cce4678c92d100c22dfe8e4',
    },
    {
      path: 'cua-first.json',
      bytes: 1015,
      sha256: '51afb447c2d70eb7720bbae8e85dfe36b16f6083f554d16815b5dbd11f82fda0',
    },
    {
      path: 'cua-preview.json',
      bytes: 2067,
      sha256: 'f486d661a15565d02e795d71848699c5397fe3f994c56c9b37221bbf394efb5f',
    },
    {
      path: 'prior-audit.json',
      bytes: 6166,
      sha256: '62e967e509fc1ff801a1cb7102e150ce8d9ef4f8e949c0911b154535cf083b22',
    },
    {
      path: 'prior-audit.mts',
      bytes: 4171,
      sha256: 'd75ccbd0d89dfacc4b309585149a92167463988934185cb7a0068656580db323',
    },
    {
      path: 'issue151-reviews.json',
      bytes: 709,
      sha256: '4550503d953f54d391902bb5df5864da9fe138b11567933111a27d636057d4d9',
    },
  ],
  reviewValueDigest: '21f6db692d30255ddc0e535dbdf5146f75701de0a3658746af98e571d134af09',
  lessons: [
    {
      id: 'python-oop-ch01-l01',
      learnerDigest: '7e175c505a055d76b1b2c590fc11a0b57b923d797cadf839fb680d17f63b859a',
      exerciseDigest: 'a896033d9d6a8ed033681bf9b67a7a18025b30057f3005c0ad88053a775d1895',
      navigationDigest: 'df75f58d960410c0c8db5f9d309b7057b713cc2e58fed7f045027f3218363c2e',
      persistenceDigest: 'dfc42f2017f1160f019ecf6d23555e4dfb2253633cf438396b60054610dab3a9',
      sourceHash: '25189c5dae586b9e3f654e5dec200ca18ff3a2d6c131eb06bc1134cf94c12b5e',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch01-l02',
      learnerDigest: '1a5fcbaccb4b9f90b32068e497a9889bfba3a8ded863b8bea652815c892adb92',
      exerciseDigest: '01a92e33bb0ab646eb7229486053b4e17e16e2182bddcdd253f3e33f3594e35d',
      navigationDigest: 'af3b4077b46f8dbf61eeb6257f5947cd05db2b8d836ee47ae4e9445ec55070f6',
      persistenceDigest: 'cd2dcbadee8d0b865d323c751d8a088d902b211266f0fad9e5d444ad0083948a',
      sourceHash: 'a303ab6a295cfdee8bedf5988cfad0f387dd3562e63ff7c7092a79cf36433ccb',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch02-l01',
      learnerDigest: 'b3afcd015182341e0890f834554b577aa20caecf648fa5a50124f30d2a5f3371',
      exerciseDigest: '44d0a92bdccbe1bdfc9e5904f88aaeeb90c122e9a87ab7031efebcad1a5c7f5e',
      navigationDigest: '50c5b2f3c9a25a182a7eaa0aaa6780df76bc8cdd87064dcdad97472d8f5a1d09',
      persistenceDigest: '403f170b72f87bfa567e01be97259c157b162de2488caa47d9eac2395a576a84',
      sourceHash: '4bc205a5ec113864482ef47db9f8f6c05a797ead308139122c0577e921301c91',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch02-l02',
      learnerDigest: '667fec1f901b52fd554965292ee1e70d5fe91cc42c0a9d91c9b3e7e8a8e79a1f',
      exerciseDigest: 'd397b118e404adad8c2edc1ad3755d47d9bca4bf390412f0354ebe8122d391de',
      navigationDigest: '5fab48ae02cf8eb41c7256ba3d9b5f7137ed211ac56329b74fd302ce01a6b88c',
      persistenceDigest: 'b762d7a7335abce1d7a265707eb8054ec757871cd8a4fda6999d2ca0ac36ba28',
      sourceHash: 'fd5febdb957a31292082681da7ecaaeef8f9fecb1bd6c1396863f34174ce0623',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch02-l03',
      learnerDigest: 'c93261c7d9a6f3ab361ec28a81dd144dd9ba28026bab208d9b0cdedc7c1b7fab',
      exerciseDigest: '8e86665d718b156e6d67a6fa092a4a63250087d1e05a8e3187deebb33ce56998',
      navigationDigest: 'ee59c50ef151295736fdc095ee68660273adf1821d2834e3da57dd1f1edfc330',
      persistenceDigest: 'a0e04c58eb16b38ffd538c9dc5fc8dadc3919e02e928acfa2c0c602c445a9602',
      sourceHash: '4bc1e3c25a8b8c2c368e72067f61e5087604fdb3e47f5702dbce19b976fe45ea',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch03-l01',
      learnerDigest: '8cb2bd58d7a31a7376ed707662d3a6e45fb29640e6f4a6363beb999c875f6985',
      exerciseDigest: 'e0b8cd9abe5bd8140d4235d39168cc6d4b0346a9149c64fc82b89d175e439793',
      navigationDigest: 'df75f58d960410c0c8db5f9d309b7057b713cc2e58fed7f045027f3218363c2e',
      persistenceDigest: '0c6531f47be1d0656ebb756c4bdd9f33a697bcec733dd66485f322d44cad6e5e',
      sourceHash: '505619ae24182fdc685afcc9e9991439c408d931b3bbe9b013f5eed0039be501',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch03-l02',
      learnerDigest: 'a45547c367c6b1d399e44218c78e2953c01dc8609758a4a6e6cafa116c71e2e5',
      exerciseDigest: '66e181eebdf869239cff6e6178ae32b69ba62eb57418b8b724706aa0f3015df7',
      navigationDigest: '074444912962b0a87affdf270656332523c2d1224ba5a99e55e1bc73ec6ee23f',
      persistenceDigest: '5de8a58fa6afa73771e319d66370af6a3bf0f6e255822c7c8a8a445cb998eed4',
      sourceHash: '9230315c2c72bc59eaab5aadf952b9c4ad9d12461cd3fdd8e69bff10766ddf8f',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch03-l03',
      learnerDigest: '871d12a0e4d6f476726f20387784a2f753d9e6861547f27a54ad0e342ecadd14',
      exerciseDigest: 'ecde0d1af8137d27dda3b35df6b6f81bbf8f3bd4779f96f68fd8e0ed0a48b375',
      navigationDigest: '2b6657d27d97e5223559ccf9dd8040db58ca7c8599dac392bb19a54d32a2680c',
      persistenceDigest: '8dbae247cf279556c8f43850e44becf2974e0c41bf056f074d3f73c783849498',
      sourceHash: '8b9756ca599d5ba911beb40d0d61f908da01c7d714d41c184f3bc8212020175f',
      kind: 'standard',
    },
    {
      id: 'python-oop-ch04-l01',
      learnerDigest: '104704467a4ab4ff03d80919aa9e9311af5c6335ea2e907d49aa12ac110469a4',
      exerciseDigest: '51ddcfe73a3df790d9f4aef958c9b3946616ed45f8b8d678031036a395eace36',
      navigationDigest: '7d5360d6d33fd7d82cb8bd246e3b187d6c006588488ab6697f3c5bd4a224eb89',
      persistenceDigest: '3f0b7fe2959ba0b6eaa91db320bdc5abb4aa97ef339785aff88483165bd6e58d',
      sourceHash: 'c7e3f674e42b8892782e5aa87291ae2b0bb5c1c8b3825e75b761093598ff9b87',
      kind: 'guided-project',
    },
  ],
};
export type PythonOopHistoricalDeclaration = Omit<typeof pinned, 'status' | 'uiObservation'> & {
  status: 'proposal-not-a-content-receipt';
  uiObservation: Omit<typeof pinned.uiObservation, 'exactObservationTimestamp'> & {
    exactObservationTimestamp: string | null;
  };
};

export function pythonOopHistoricalDeclaration(): PythonOopHistoricalDeclaration {
  return structuredClone(pinned) as PythonOopHistoricalDeclaration;
}

/** 再hashによる別Source・Course・Lesson集合・観察範囲への拡張を拒否する。 */
export function validatePythonOopHistoricalDeclaration(input: unknown) {
  if (hashValue(input) !== hashValue(pinned))
    throw Error('Historical Python OOP declaration differs');
  return pythonOopHistoricalDeclaration();
}

/** 先行監査を含む原本bytesを固定照合する。UI receiptは生成しない。 */
export function validatePythonOopHistoricalOriginals(originals: ReadonlyMap<string, Uint8Array>) {
  if (originals.size !== pinned.privateReferences.length)
    throw Error('Historical Python OOP original set differs');
  for (const reference of pinned.privateReferences) {
    const bytes = originals.get(reference.path);
    if (!bytes || bytes.length !== reference.bytes || hashBytes(bytes) !== reference.sha256)
      throw Error('Historical Python OOP original bytes differ: ' + reference.path);
  }
  return pythonOopHistoricalDeclaration();
}

const WithdrawalSchema = z
  .object({
    courseId: IdSchema,
    lessonId: IdSchema,
    learnerDigest: DigestSchema,
    sourceCommit: CommitSchema,
    reason: z.enum(['approval-withdrawn', 'known-finding']),
  })
  .strict();
interface CurrentReview {
  readonly reviewLedger: unknown;
  readonly sourceHashes: ReadonlyMap<string, string>;
  readonly withdrawals: unknown;
}

/** OOPだけの保守的な適合照合。原稿変更後の受入は別契約へ残す。 */
export function verifyPythonOopHistoricalCandidate(
  inventoryInput: unknown,
  declarationInput: unknown,
  review: CurrentReview,
) {
  const declaration = validatePythonOopHistoricalDeclaration(declarationInput);
  const inventory = InventorySchema.parse(inventoryInput);
  const courses = inventory.courses.filter(({ id }) => id === declaration.courseId);
  const course = courses[0];
  if (
    courses.length !== 1 ||
    !course ||
    course.runner !== 'python' ||
    course.lessons.length !== declaration.lessons.length ||
    new Set(course.lessons.map(({ id }) => id)).size !== declaration.lessons.length ||
    course.lessons.some(({ id }) => !declaration.lessons.some((lesson) => lesson.id === id))
  )
    throw Error('Historical Python OOP lesson set differs');
  if (
    review.sourceHashes.size !== declaration.lessons.length ||
    declaration.lessons.some(({ id, sourceHash }) => review.sourceHashes.get(id) !== sourceHash)
  )
    throw Error('Historical Python OOP source hash differs');
  // 旧承認で現在の拒否・撤回・承認注記の書換えを隠さない。
  if (hashValue(review.reviewLedger) !== declaration.reviewValueDigest)
    throw Error('Historical Python OOP current review differs');
  const currentReview = verifyReviewLedger(review.reviewLedger, review.sourceHashes);
  const withdrawals = z.array(WithdrawalSchema).parse(review.withdrawals);
  // 固定案件には撤回のない状態だけを認める。撤回対象のhash/ID変更で迂回させない。
  // 別版の撤回を含む案件は、共有policyの担当が原本と対応付けて別途判断する。
  if (withdrawals.some((row) => row.courseId === declaration.courseId))
    throw Error('Historical Python OOP content withdrawal blocks this fixed case');
  for (const lesson of declaration.lessons) {
    const current = course.lessons.find(({ id }) => id === lesson.id)!;
    if (
      current.kind !== lesson.kind ||
      (['learner', 'exercise', 'navigation', 'persistence'] as const).some(
        (scope) => current[`${scope}Digest`] !== lesson[`${scope}Digest`],
      )
    )
      throw Error('Historical Python OOP fingerprint differs: ' + lesson.id);
    if (hashValue(current.exercises) !== current.exerciseDigest)
      throw Error('Historical Python OOP exercise inventory differs: ' + lesson.id);
  }
  return {
    ...declaration,
    currentReview,
    // 共有runtime/previewと5 scope保守hashは旧Sourceから変化した。
    // 原稿不変でも本提案は現候補の技術検証を承認しない。
    technicalRechecks: ['runtime', 'usability', 'accessibility', 'persistence', 'delivery'],
  };
}

/** 実Git object、現原稿・台帳・policy、固定私有原本を読み取る。
 * 正式receiptの独立認証と最終qualify・CLIの接続はRootの責務。
 * 子画像・現UI・runtime実行・公開はこの照合の対象外。 */
export async function readVerifiedPythonOopHistoricalEvidence(
  root: string,
  originalsDirectory: string,
) {
  const privateRoot = await realpath(originalsDirectory);
  const originals = new Map<string, Uint8Array>();
  for (const reference of pinned.privateReferences) {
    const file = path.join(privateRoot, reference.path);
    const stat = await lstat(file);
    if (!stat.isFile() || (await realpath(file)) !== file || stat.size !== reference.bytes)
      throw Error('Historical Python OOP original file differs: ' + reference.path);
    originals.set(reference.path, await readFile(file));
  }
  const declaration = validatePythonOopHistoricalOriginals(originals);
  const evidence = await readPythonOopHistoricalPublicEvidence(root, declaration);
  return {
    ...evidence,
    originalsInspection: {
      ...evidence.originalsInspection,
      privateReferencesChecked: declaration.privateReferences.length,
    },
  };
}

/** 独立認証sidecarのtrusted caller専用。ここでは私有原本を再検査しない。 */
export async function readPythonOopHistoricalPublicEvidence(
  root: string,
  declarationInput: unknown,
  inventoryInput?: unknown,
) {
  const declaration = validatePythonOopHistoricalDeclaration(declarationInput);
  const env = await repositoryEnvironment(root);
  const git = async (...args: string[]) =>
    (
      await exec('git', args, {
        cwd: root,
        env,
        encoding: 'buffer',
        maxBuffer: 4 * 1024 * 1024,
      })
    ).stdout;
  if (
    (await git('rev-parse', declaration.sourceCommit + '^{tree}')).toString().trim() !==
      declaration.sourceTree ||
    (await git('rev-parse', declaration.sourceCommit + ':content/python-oop')).toString().trim() !==
      declaration.courseTree ||
    (await git('rev-parse', declaration.candidateReference + ':content/python-oop'))
      .toString()
      .trim() !== declaration.courseTree
  )
    throw Error('Historical Python OOP Git source tree differs');
  if (
    (await git('rev-parse', declaration.candidateReference + '^{tree}')).toString().trim() !==
      '031169e0eac90cfde8fe5974fc894345d0bc6dd4' ||
    (await git('rev-parse', '7384850f52b1d3edf9132289464a5c854ee57672^{tree}'))
      .toString()
      .trim() !== declaration.sourceTree
  )
    throw Error('Historical Python OOP candidate or merged source tree differs');
  for (const reviewed of declaration.reviewedSources) {
    for (const source of [reviewed.sourceCommit, reviewed.mergeCommit]) {
      if ((await git('rev-parse', source + '^{tree}')).toString().trim() !== reviewed.sourceTree)
        throw Error('Historical Python OOP reviewed Git tree differs');
    }
    await git('merge-base', '--is-ancestor', reviewed.mergeCommit, declaration.sourceCommit);
  }
  for (const reference of declaration.publicReferences) {
    const bytes = await git('show', reference.sourceCommit + ':' + reference.path);
    if (bytes.length !== reference.bytes || hashBytes(bytes) !== reference.sha256)
      throw Error('Historical Python OOP Git reference bytes differ');
  }
  const archived = await readInventoryAtSource(
    root,
    declaration.sourceCommit,
    declaration.courseId,
  );
  const courseRoot = path.join(root, 'content/python-oop');
  const current = buildInventory([await compileCourse(courseRoot)]);
  if (inventoryInput !== undefined) {
    const supplied = InventorySchema.parse(inventoryInput).courses.filter(
      (course) => course.id === declaration.courseId,
    );
    if (supplied.length !== 1 || hashValue(supplied[0]) !== hashValue(current.courses[0]))
      throw Error('Python historical candidate inventory differs from current source');
  }
  const sourceHashes = new Map<string, string>();
  for (const lesson of declaration.lessons) {
    const chapter = lesson.id.slice(0, lesson.id.lastIndexOf('-'));
    sourceHashes.set(
      lesson.id,
      await computeLessonSourceHash(
        path.join(courseRoot, 'chapters', chapter, 'lessons', lesson.id),
      ),
    );
  }
  const reviewBytes = await readFile(path.join(root, reviewPath));
  const reference = declaration.publicReferences[0]!;
  if (reviewBytes.length !== reference.bytes || hashBytes(reviewBytes) !== reference.sha256)
    throw Error('Historical Python OOP current review bytes differ');
  const reviewLedger: unknown = parse(reviewBytes.toString('utf8'));
  const policy = z
    .object({ receipts: z.array(z.unknown()), withdrawals: z.array(WithdrawalSchema) })
    .strict()
    .extend({
      schemaVersion: z.literal(1),
    })
    .parse(JSON.parse(await readFile(path.join(root, policyPath), 'utf8')) as unknown);
  const review = { reviewLedger, sourceHashes, withdrawals: policy.withdrawals };
  verifyPythonOopHistoricalCandidate(archived.inventory, declaration, review);
  return {
    ...verifyPythonOopHistoricalCandidate(current, declaration, review),
    status: 'verified-proposal-not-a-content-receipt' as const,
    originalsInspection: {
      privateReferencesChecked: 0,
      publicReferencesChecked: declaration.publicReferences.length,
      reviewedSourceTreesChecked: declaration.reviewedSources.length,
      currentRuntimeExecuted: false,
      currentComputerUsePerformed: false,
      independentChildImagesInspected: false,
    },
  };
}
