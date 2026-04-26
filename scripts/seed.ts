import {
  runSeed,
  SeedAlreadyExistsError,
} from '../src/db/seed.js';

async function main() {
  const force = process.argv.includes('--force');
  const { closeDb, getDb } = await import('../src/db/client.js');
  const db = getDb();

  try {
    const counts = await runSeed(db, { force });
    console.log('[seed] OK — counts:');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table.padEnd(22)} ${count}`);
    }
  } catch (err) {
    if (err instanceof SeedAlreadyExistsError) {
      console.error(`[seed] ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  } finally {
    closeDb();
  }
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed.ts') === true ||
  process.argv[1]?.endsWith('seed.js') === true;

if (invokedDirectly) {
  void main();
}

// Re-export so existing test imports `from '../../scripts/seed.js'` keep
// working without churn.
export {
  runSeed,
  SeedAlreadyExistsError,
} from '../src/db/seed.js';
export type { SeedCounts, SeedOptions } from '../src/db/seed.js';
