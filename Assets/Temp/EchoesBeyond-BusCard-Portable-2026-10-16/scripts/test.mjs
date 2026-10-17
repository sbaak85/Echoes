import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = ['model.test.mjs', 'input.test.mjs', 'drag.test.mjs', 'drag-lifecycle.test.mjs'];
for (const variant of ['bus-card-preview', 'bus-card-portrait-preview']) {
  console.log(`\n=== ${variant} ===`);
  const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: path.join(root, 'previews', variant), stdio: 'inherit' });
  if (result.error || result.status !== 0) { console.error(result.error?.message || `Test exit: ${result.status}`); process.exit(1); }
}
