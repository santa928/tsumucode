import path from 'node:path';
import { compileCourse } from '../../../scripts/content/compileCourse';
import { buildInventory } from '../../../scripts/release/v2/inventory';
import { readVerifiedPythonHistoricalAcceptances } from '../../../scripts/release/v2/pythonHistoricalAcceptance';
import {
  pythonPracticeHistoricalDeclaration,
  readPythonPracticeHistoricalPublicEvidence,
} from '../../../scripts/release/v2/pythonPracticeHistoricalAcceptance';
import { countTechnicalRechecks, formatFailure, type ProbeStage } from './diagnostic.ts';

let stage: ProbeStage = 'compile';
async function main(): Promise<void> {
  const root = process.cwd();
  const compiled = await compileCourse(path.join(root, 'content/python-practice'));
  stage = 'inventory';
  const inventory = buildInventory([compiled]);
  const course = inventory.courses[0];
  stage = 'candidate';
  if (
    inventory.courses.length !== 1 ||
    course?.id !== 'python-practice' ||
    course.publicationStatus !== 'published' ||
    course.lessons.length !== 5
  )
    throw new Error('candidate shape');
  stage = 'reader';
  const receipts = await readVerifiedPythonHistoricalAcceptances(root, inventory);
  stage = 'receipt';
  if (
    receipts.length !== 1 ||
    receipts[0]?.courseId !== 'python-practice' ||
    receipts[0].sourceCommit !== '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931' ||
    receipts[0].receiptDigest !== 'e5d27e6fe7567dae5c80fdcfee2d49541915c016eb849414d9b1c6af79abc4a5'
  )
    throw new Error('receipt identity');
  stage = 'rechecks';
  const details = await readPythonPracticeHistoricalPublicEvidence(
    root,
    inventory,
    pythonPracticeHistoricalDeclaration(),
  );
  const counts = countTechnicalRechecks(details.technicalRechecks);
  process.stdout.write(`practice-technical-rechecks=${counts.join(',')}\n`);
  if (counts.some((count) => count !== 0)) throw new Error('Technical rechecks required');
  process.stdout.write('practice-public-reader=passed; lessons=5; old-reader-commit=unverified\n');
}

main().catch((error: unknown) => {
  process.stderr.write(formatFailure(stage, error));
  process.exitCode = 1;
});
