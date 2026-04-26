import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const pairs = [
  {
    label: 'migrations',
    src: path.resolve(root, 'src/db/migrations'),
    dst: path.resolve(root, 'dist/db/migrations'),
  },
  {
    label: 'poller fixtures',
    src: path.resolve(root, 'src/pollers/fixtures'),
    dst: path.resolve(root, 'dist/pollers/fixtures'),
  },
];

let failed = false;
for (const { label, src, dst } of pairs) {
  if (!fs.existsSync(src)) {
    console.error(`[copy-assets] ${label} source folder missing: ${src}`);
    failed = true;
    continue;
  }
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  const files = fs.readdirSync(dst, { recursive: true });
  console.log(
    `[copy-assets] ${label}: ${src} -> ${dst} (${files.length} entries)`,
  );
}

if (failed) process.exit(1);
