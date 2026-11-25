import { loadConfig } from "../src/config.js";
import { closeDatabase, createDatabasePool } from "../src/db/connection.js";
import { migrate } from "../src/db/migrations.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createDatabasePool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl,
    max: 1,
  });

  try {
    const version = await migrate(pool);
    console.log(`Database is at schema version ${version}.`);
  } finally {
    await closeDatabase(pool);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
