import { types } from 'node:util';
import { hashValue } from './identity';
import { verifyMovementInputs } from './movement';
import { verifyPythonMovementPredecessor } from './movementPredecessor';
import { validateCapturedBaseline } from './parent';
import { assertFixedPythonFirstAnchor } from './pythonFirstAnchorIdentity';
import { parseUniqueHistoryJson } from './uniqueHistoryJson';

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const bufferDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer');
const lengthDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength');
const offsetDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset');
const declarationDigest = '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494';

function snapshot(input: unknown, max: number): Buffer {
  if (!types.isUint8Array(input) || !bufferDescriptor?.get || !lengthDescriptor?.get || !offsetDescriptor?.get)
    throw Error('Invalid bytes');
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) throw Error('Invalid bytes');
  const backing: unknown = bufferDescriptor.get.call(input);
  const length: unknown = lengthDescriptor.get.call(input);
  const offset: unknown = offsetDescriptor.get.call(input);
  if (!types.isArrayBuffer(backing) || typeof length !== 'number' || !length || length > max || typeof offset !== 'number')
    throw Error('Invalid bytes');
  return Buffer.from(new Uint8Array(backing, offset, length));
}

/**
 * Fixed historical bytes and their internal bindings only. This is not a fresh parent observation,
 * artifact provenance, qualification of the current candidate, or permission to deploy or sign.
 */
export function inspectPythonFirstHistory(capturedInput: Uint8Array, tagInput: Uint8Array, historyInput: Uint8Array) {
  try {
    const capturedBytes = snapshot(capturedInput, 16 * 1024 * 1024);
    const tag = snapshot(tagInput, 16 * 1024);
    const historyBytes = snapshot(historyInput, 16 * 1024 * 1024);
    const decode = (value: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(value);
    const captured = validateCapturedBaseline(parseUniqueHistoryJson(decode(capturedBytes)));
    assertFixedPythonFirstAnchor(captured.proof, tag);
    const history = parseUniqueHistoryJson(decode(historyBytes));
    if (!history || typeof history !== 'object' || !('proof' in history) || !('tagObject' in history) ||
        hashValue(history.proof) !== hashValue(captured.proof) || history.tagObject !== decode(tag))
      throw Error('Historical anchor differs');
    // The fixed tag and captured parent are checked above. This digest only binds the parsed payload
    // while the existing verifier runs; it is not an independent trust root.
    const result = verifyPythonMovementPredecessor(history, captured.baseline, hashValue(history), verifyMovementInputs);
    if (result.movementDeclarationDigest !== declarationDigest) throw Error('Historical declaration differs');
    return { authorized: false as const };
  } catch {
    // Avoid returning historical content, exception text or causes to a future caller.
    throw Error('Historical anchor evidence invalid');
  }
}
