import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.resolve(root, 'src/db/migrations');
const dst = path.resolve(root, 'dist/db/migrations');

if (!fs.existsSync(src)) {
  console.error(`[copy-migrations] source folder missing: ${src}`);
  process.exit(1);
}

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true });

const files = fs.readdirSync(dst, { recursive: true });
console.log(
  `[copy-migrations] copied ${src} -> ${dst} (${files.length} entries)`,
);
