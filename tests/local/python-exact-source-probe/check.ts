import path from 'node:path';
import { compileCourse } from '../../../scripts/content/compileCourse';
import { buildInventory } from '../../../scripts/release/v2/inventory';
import { verifyContent } from '../../../scripts/release/v2/content';
import { readVerifiedPythonHistoricalAcceptances } from '../../../scripts/release/v2/pythonHistoricalAcceptance';
import {
  pythonPracticeHistoricalDeclaration,
  readPythonPracticeHistoricalPublicEvidence,
} from '../../../scripts/release/v2/pythonPracticeHistoricalAcceptance';
import {
  pythonOopHistoricalDeclaration,
  readPythonOopHistoricalPublicEvidence,
} from '../../../scripts/release/v2/pythonOopHistoricalAcceptance';
import { countTechnicalRechecks, formatFailure, type ProbeStage } from './diagnostic.ts';

let stage: ProbeStage = 'compile';
async function main(): Promise<void> {
  const root = process.cwd();
  const compiled = await Promise.all([
    compileCourse(path.join(root, 'content/python-practice')),
    compileCourse(path.join(root, 'content/python-oop')),
  ]);
  stage = 'inventory';
  const inventory = buildInventory(compiled);
  stage = 'candidate';
  for (const [id, lessons] of [
    ['python-practice', 5],
    ['python-oop', 9],
  ] as const) {
    const selected = inventory.courses.filter((course) => course.id === id);
    if (
      selected.length !== 1 ||
      selected[0]?.publicationStatus !== 'published' ||
      selected[0].lessons.length !== lessons
    )
      throw new Error('Fixed course shape differs');
  }
  stage = 'reader';
  const receipts = await readVerifiedPythonHistoricalAcceptances(root, inventory);
  stage = 'receipt';
  const expectedReceipts = new Map([
    ['python-practice', 'e5d27e6fe7567dae5c80fdcfee2d49541915c016eb849414d9b1c6af79abc4a5'],
    ['python-oop', 'e09ad4ac955ed971c73a294f28f86766923548ab54f1f9e8c70aac6326a37c2b'],
  ]);
  if (
    receipts.length !== 2 ||
    receipts.some(
      (receipt) =>
        receipt.sourceCommit !== '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931' ||
        expectedReceipts.get(receipt.courseId) !== receipt.receiptDigest,
    )
  )
    throw new Error('Receipt identity differs');
  stage = 'rechecks';
  const practice = await readPythonPracticeHistoricalPublicEvidence(
    root,
    inventory,
    pythonPracticeHistoricalDeclaration(),
  );
  const counts = countTechnicalRechecks(practice.technicalRechecks);
  process.stdout.write(`practice-technical-rechecks=${counts.join(',')}\n`);
  if (counts.some((count) => count !== 0)) throw new Error('Practice rechecks required');
  stage = 'oop';
  const oop = await readPythonOopHistoricalPublicEvidence(
    root,
    pythonOopHistoricalDeclaration(),
    inventory,
  );
  const expectedScopes = ['runtime', 'usability', 'accessibility', 'persistence', 'delivery'];
  if (
    JSON.stringify(oop.technicalRechecks) !== JSON.stringify(expectedScopes) ||
    oop.originalsInspection.publicReferencesChecked !== 5 ||
    oop.originalsInspection.reviewedSourceTreesChecked !== 4 ||
    oop.originalsInspection.privateReferencesChecked !== 0
  )
    throw new Error('OOP review scope differs');
  stage = 'content';
  const content = verifyContent(inventory, [], undefined, [], receipts);
  if (
    content.status !== 'historical' ||
    content.historicallyAcceptedLessons?.length !== 14 ||
    content.newlyApprovedLessons.length !== 0 ||
    content.technicalRechecks.length !== 0 ||
    content.pythonHistoricalAcceptances?.length !== 2
  )
    throw new Error('Historical content classification differs');
  process.stdout.write(
    'public-reader=passed; practice-lessons=5; oop-lessons=9; historical-lessons=14\n',
  );
  process.stdout.write(
    'oop-technical-scopes=runtime,usability,accessibility,persistence,delivery\n',
  );
  process.stdout.write(
    'private-originals=unverified; old-reader-commit=unverified; new-role-observations=0\n',
  );
}

main().catch((error: unknown) => {
  process.stderr.write(formatFailure(stage, error));
  process.exitCode = 1;
});
