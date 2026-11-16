import { mkdir, writeFile } from 'node:fs/promises';
import { compileCourse } from '../../scripts/content/compileCourse';
import { buildInventory } from '../../scripts/release/v2/inventory';
import { diagnosticPreparation } from '../e2e/helpers/manifestDiagnosticPlan';

// Synthetic selection only: neither a release receipt nor a parent observation.
const inventory = buildInventory([await compileCourse('content/python-practice')]);
const preparation = diagnosticPreparation(inventory);
await mkdir('.release-v2', { recursive: true });
await writeFile('.release-v2/preparation.json', JSON.stringify(preparation), { mode: 0o600 });
