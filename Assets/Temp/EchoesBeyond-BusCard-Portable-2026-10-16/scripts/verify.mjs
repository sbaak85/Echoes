import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
let failed = 0;
for (const entry of manifest.files) {
  const absolute = path.resolve(root, entry.path);
  if (!absolute.startsWith(root + path.sep)) { console.error(`Invalid path: ${entry.path}`); failed++; continue; }
  try {
    const bytes = await readFile(absolute);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry.sha256 || bytes.length !== entry.bytes) { console.error(`CHANGED: ${entry.path}`); failed++; }
  } catch { console.error(`MISSING: ${entry.path}`); failed++; }
}
console.log(`${manifest.files.length - failed}/${manifest.files.length} files match the packaged baseline.`);
if (failed) console.log('After intentional edits, CHANGED is expected. This verifier never overwrites files.');
process.exitCode = failed ? 1 : 0;
