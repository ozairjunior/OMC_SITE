import { readdir } from 'node:fs/promises';
import path from 'node:path';

const migrationsDir = path.resolve('supabase/migrations');
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql'));
const versions = new Map();

for (const file of files) {
  const version = file.split('_', 1)[0];
  if (!/^\d+$/.test(version)) continue;

  const previous = versions.get(version);
  if (previous) {
    console.error(`Duplicate migration version ${version}: ${previous} and ${file}`);
    process.exitCode = 1;
    continue;
  }
  versions.set(version, file);
}

if (process.exitCode !== 1) {
  console.log(`Migration versions are unique (${versions.size} checked).`);
}
