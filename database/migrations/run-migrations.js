// database/migrations/run-migrations.js
// Simple migration runner without migrations table tracking
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../../config/database.js";
import { createComponentLogger } from "../../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createComponentLogger("MIGRATIONS");

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName) {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    return result.rows[0].exists;
  } catch (error) {
    logger.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  }
}

/**
 * Check if all required tables exist
 */
async function allTablesExist() {
  const requiredTables = [
    'users', 
    'sessions', 
    'groups', 
    'messages', 
    'warnings', 
    'violations', 
    'settings', 
    'group_analytics'
  ];

  try {
    for (const table of requiredTables) {
      const exists = await tableExists(table);
      if (!exists) {
        logger.info(`Table '${table}' does not exist`);
        return false;
      }
    }
    
    logger.info("All required database tables exist");
    return true;
  } catch (error) {
    logger.error("Error checking table existence:", error);
    return false;
  }
}

/**
 * Test if groups table has proper unique constraint
 */
async function testGroupsConstraint() {
  try {
    // Try an ON CONFLICT operation
    await pool.query(`
      INSERT INTO groups (jid, name, updated_at)
      VALUES ('constraint_test@g.us', 'Test', CURRENT_TIMESTAMP)
      ON CONFLICT (jid) 
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `);
    
    // Clean up
    await pool.query(`DELETE FROM groups WHERE jid = 'constraint_test@g.us'`);
    
    logger.info("Groups table constraint test passed");
    return true;
  } catch (error) {
    logger.error("Groups table constraint test failed:", error.message);
    return false;
  }
}

/**
 * Run database migrations
 */
async function runMigrations() {
  try {
    logger.info("🔄 Setting up database schema...");

    // Test database connection first
    try {
      await pool.query('SELECT NOW()');
      logger.info("Database connection verified");
    } catch (error) {
      logger.error("❌ Database connection failed:", error);
      throw error;
    }

    // Check if all tables already exist
    const tablesExist = await allTablesExist();
    if (tablesExist) {
      // Test if constraints work properly
      const constraintWorks = await testGroupsConstraint();
      if (constraintWorks) {
        logger.info("✅ Database schema is up to date and working properly");
        return true;
      } else {
        logger.warn("⚠️  Tables exist but constraints may need fixing");
      }
    }

    // Read and execute SQL files
    const migrationsDir = path.join(__dirname);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      logger.error("❌ No SQL migration files found");
      return false;
    }

    logger.info(`Found ${files.length} SQL file(s) to execute`);

    // Execute each SQL file
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      
      logger.info(`➡️  Executing SQL file: ${file}`);
      
      try {
        // Execute the entire SQL file
        await pool.query(sql);
        logger.info(`✅ Successfully executed: ${file}`);
        
      } catch (sqlError) {
        logger.error(`❌ Failed to execute ${file}:`, sqlError.message);
        throw sqlError;
      }
    }

    // Verify everything is working
    const finalCheck = await allTablesExist();
    if (!finalCheck) {
      throw new Error("Tables were not created properly");
    }

    const constraintCheck = await testGroupsConstraint();
    if (!constraintCheck) {
      throw new Error("Database constraints are not working properly");
    }

    logger.info("✅ Database schema setup completed successfully");
    return true;

  } catch (error) {
    logger.error("❌ Database setup failed:", error);
    throw error;
  }
}

/**
 * Verify database schema integrity
 */
async function verifyDatabaseSchema() {
  try {
    logger.info("🔍 Verifying database schema integrity...");

    const requiredTables = [
      'users', 'sessions', 'groups', 'messages', 
      'warnings', 'violations', 'settings', 'group_analytics'
    ];

    for (const table of requiredTables) {
      const exists = await tableExists(table);
      if (!exists) {
        throw new Error(`Required table '${table}' is missing from database`);
      }
    }

    // Test key operations
    await pool.query('SELECT COUNT(*) FROM users LIMIT 1');
    await pool.query('SELECT COUNT(*) FROM groups LIMIT 1');
    
    // Test the most important constraint
    const constraintWorks = await testGroupsConstraint();
    if (!constraintWorks) {
      throw new Error("Groups table ON CONFLICT constraint is not working");
    }
    
    logger.info("✅ Database schema verification completed successfully");
    return true;
    
  } catch (error) {
    logger.error("❌ Database schema verification failed:", error);
    throw error;
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  try {
    const stats = {};
    const tables = ['users', 'sessions', 'groups', 'messages', 'warnings', 'violations', 'settings', 'group_analytics'];

    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        stats[table] = parseInt(result.rows[0].count);
      } catch (error) {
        stats[table] = 0;
      }
    }

    logger.info("Database Statistics:", stats);
    return stats;
  } catch (error) {
    logger.error("Error getting database stats:", error);
    return {};
  }
}

// Export functions
export { 
  runMigrations, 
  allTablesExist, 
  tableExists, 
  verifyDatabaseSchema,
  getDatabaseStats,
  testGroupsConstraint
};

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      logger.info("✅ Database setup process completed successfully");
      return getDatabaseStats();
    })
    .then((stats) => {
      logger.info("Final database state:", stats);
      process.exit(0);
    })
    .catch((error) => {
      logger.error("❌ Database setup process failed:", error);
      process.exit(1);
    });
}
