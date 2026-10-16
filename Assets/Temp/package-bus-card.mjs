import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const output = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(output, 'EchoesBeyond-BusCard-Portable-2026-10-16');
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`No links allowed: ${absolute}`);
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) throw new Error(`Unexpected dependency directory: ${absolute}`);
      await walk(absolute);
    } else {
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      if (relative === 'manifest.json') continue;
      const bytes = await readFile(absolute);
      const item = { path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      if (relative.endsWith('.png') && bytes.subarray(1, 4).toString() === 'PNG') item.image = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      files.push(item);
    }
  }
}
await walk(root);
files.sort((a,b) => a.path.localeCompare(b.path, 'en'));
const manifest = { package: 'EchoesBeyond-BusCard-Portable-2026-10-16', snapshotDate: '2026-10-16', timezone: 'Asia/Taipei', runtimeTested: 'Node.js v24.19.0 / Windows x64', nodeExecutableIncluded: false, excludes: ['manifest.json'], files };
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest: ${files.length} files; ${files.reduce((total,item)=>total+item.bytes,0)} bytes.`);
