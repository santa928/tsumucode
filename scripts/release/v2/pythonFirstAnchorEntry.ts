import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashBytes } from './identity';
import { producePythonFirstAnchor } from './pythonFirstAnchorProducer';

const maxContextBytes = 16 * 1024;
const maxEvidenceBytes = 16 * 1024;

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

/** The inputs are claims only; workflow identity, isolation and artifact provenance require independent verification. */
export async function executePythonFirstAnchorEntry(args: string[]): Promise<string> {
  if (args.length !== 4 || args.some((arg) => !path.isAbsolute(arg)))
    throw Error('Anchor entry requires four absolute paths');
  const [candidatePath, verifierPath, contextPath, outputPath] = args as [
    string,
    string,
    string,
    string,
  ];
  const candidate = await realpath(candidatePath);
  const verifier = await realpath(verifierPath);
  const contextReal = await realpath(contextPath);
  const outputParent = await realpath(path.dirname(outputPath));
  const output = path.join(outputParent, path.basename(outputPath));
  if (
    candidate === verifier ||
    [candidate, verifier].some((root) => inside(root, contextReal) || inside(root, output))
  )
    throw Error('Anchor entry paths overlap');

  const file = await open(
    contextPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let context: unknown;
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size <= 0 || before.size > maxContextBytes)
      throw Error('Invalid anchor context file');
    const bytes = Buffer.alloc(maxContextBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = await file.read(bytes, count, bytes.length - count, null);
      if (read.bytesRead === 0) break;
      count += read.bytesRead;
    }
    const after = await file.stat();
    if (
      count !== before.size ||
      count > maxContextBytes ||
      after.size !== before.size ||
      after.ino !== before.ino ||
      after.dev !== before.dev ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw Error('Anchor context file changed');
    context = JSON.parse(bytes.subarray(0, count).toString('utf8')) as unknown;
  } finally {
    await file.close();
  }

  const result = await producePythonFirstAnchor(candidate, verifier, context);
  if (
    !Buffer.isBuffer(result.evidenceBytes) ||
    result.evidenceBytes.length === 0 ||
    result.evidenceBytes.length > maxEvidenceBytes ||
    hashBytes(result.evidenceBytes) !== result.evidenceSha256
  )
    throw Error('Invalid anchor evidence');
  const temporary = path.join(outputParent, `.anchor-evidence-${randomUUID()}`);
  const destination = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      await destination.writeFile(result.evidenceBytes);
    } finally {
      await destination.close();
    }
    // link refuses an existing output and publishes only complete bytes on the same filesystem.
    await link(temporary, output);
  } finally {
    await unlink(temporary);
  }
  return result.evidenceSha256;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  executePythonFirstAnchorEntry(process.argv.slice(2)).then(
    (digest) => process.stdout.write(`${digest}\n`),
    () => {
      process.stderr.write('Anchor observation failed\n');
      process.exitCode = 1;
    },
  );
}
