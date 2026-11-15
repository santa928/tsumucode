import path from 'node:path';
import { compileCourse } from '../../../scripts/content/compileCourse';
import { buildInventory } from '../../../scripts/release/v2/inventory';
import { readVerifiedPythonHistoricalAcceptances } from '../../../scripts/release/v2/pythonHistoricalAcceptance';

async function main(): Promise<void> {
  const root = process.cwd();
  const compiled = await compileCourse(path.join(root, 'content/python-practice'));
  const inventory = buildInventory([compiled]);
  const course = inventory.courses[0];
  if (
    inventory.courses.length !== 1 ||
    course?.id !== 'python-practice' ||
    course.publicationStatus !== 'published' ||
    course.lessons.length !== 5
  )
    throw new Error('candidate shape');
  const receipts = await readVerifiedPythonHistoricalAcceptances(root, inventory);
  if (
    receipts.length !== 1 ||
    receipts[0]?.courseId !== 'python-practice' ||
    receipts[0].sourceCommit !== '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931' ||
    receipts[0].receiptDigest !== 'e5d27e6fe7567dae5c80fdcfee2d49541915c016eb849414d9b1c6af79abc4a5'
  )
    throw new Error('receipt identity');
  process.stdout.write('practice-public-reader=passed; lessons=5; old-reader-commit=unverified\n');
}

main().catch(() => {
  process.stderr.write('practice-public-reader=failed\n');
  process.exitCode = 1;
});
