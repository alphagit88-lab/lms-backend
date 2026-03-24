/**
 * One-time migration script to add the `destroyedAt` column to `app_sessions` table.
 * 
 * Required by connect-typeorm v2 for soft-delete session support.
 * Without this column, logout (session.destroy) silently fails, and
 * subsequent logins hit a "duplicate key" error → 500 Internal Server Error.
 *
 * Run once:  npx ts-node src/scripts/add-session-destroyed-column.ts
 */
import "reflect-metadata";
import { AppDataSource } from "../config/data-source";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Connecting to database...");
  await AppDataSource.initialize();
  console.log("✓ Connected");

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    // Check if column already exists
    const columns = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'app_sessions' AND column_name = 'destroyedAt'`
    );

    if (columns.length > 0) {
      console.log("✓ Column 'destroyedAt' already exists. Nothing to do.");
    } else {
      console.log("Adding 'destroyedAt' column to app_sessions...");
      await queryRunner.query(
        `ALTER TABLE "app_sessions" ADD COLUMN "destroyedAt" TIMESTAMP`
      );
      console.log("✓ Column 'destroyedAt' added successfully.");
    }

    // Also clean up any stale/corrupted session rows to prevent further issues
    const result = await queryRunner.query(
      `DELETE FROM "app_sessions" WHERE "expiredAt" <= $1`,
      [Date.now()]
    );
    console.log(`✓ Cleaned up ${result[1] || 0} expired session(s).`);

  } catch (error) {
    console.error("✗ Migration failed:", error);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }

  console.log("✓ Migration complete.");
  process.exit(0);
}

main();
