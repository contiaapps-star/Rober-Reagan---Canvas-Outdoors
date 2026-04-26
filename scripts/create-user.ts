// CLI: create or reset a user account.
//
//   docker compose exec app npx tsx scripts/create-user.ts \
//       --email=robert@flowcorewater.com --role=admin
//
// Password is read interactively when not piped, or from --password=… for
// non-interactive setups. Idempotent: existing email gets its password +
// role updated.

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';

import { closeDb, getDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { hashPassword } from '../src/lib/auth.js';

type Args = {
  email?: string;
  role?: 'admin' | 'agency';
  password?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--email=')) out.email = a.slice('--email='.length).trim();
    else if (a.startsWith('--role=')) {
      const v = a.slice('--role='.length).trim();
      if (v === 'admin' || v === 'agency') out.role = v;
    } else if (a.startsWith('--password=')) {
      out.password = a.slice('--password='.length);
    }
  }
  return out;
}

function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(prompt);
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.email) {
    console.error('error: --email=... is required');
    process.exitCode = 1;
    return;
  }
  const email = args.email.toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    console.error(`error: invalid email "${email}"`);
    process.exitCode = 1;
    return;
  }
  const role = args.role ?? 'agency';
  let password = args.password;
  if (!password) {
    password = await readPassword('Password: ');
  }
  if (!password || password.length < 8) {
    console.error('error: password must be at least 8 characters');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const db = getDb();

  try {
    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (existing) {
      db.update(users)
        .set({ passwordHash, role })
        .where(eq(users.id, existing.id))
        .run();
      console.log(`[create-user] updated existing user ${email} (role=${role})`);
    } else {
      const id = randomUUID();
      db.insert(users)
        .values({ id, email, passwordHash, role })
        .run();
      console.log(`[create-user] created ${email} (role=${role}) id=${id}`);
    }
  } finally {
    closeDb();
  }
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('create-user.ts') === true ||
  process.argv[1]?.endsWith('create-user.js') === true;

if (invokedDirectly) {
  void main();
}

export { main as createUser };
