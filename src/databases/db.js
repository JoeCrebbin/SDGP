/*
 * db.js - Database Setup and Schema
 *
 * Uses better-sqlite3, a synchronous SQLite driver for Node.js.
 * This file:
 *   1. Creates the database file (grant_vessels.db) in this directory
 *   2. Sets up all tables if they don't exist
 *   3. Runs any migrations for schema changes
 *   4. Seeds default admin and user accounts
 *   5. Inserts default global settings
 *
 * Tables:
 *   - users: email, password hash, admin flag, approval status
 *   - batches: links to a user, stores batch name, waste %, path to output CSV
 *   - raw_beams_used: tracks which beams were used per batch
 *   - components: individual cut pieces per batch
 *   - activity_logs: audit trail of user actions (for admin System Logs page)
 *   - global_settings: key-value pairs for app-wide defaults
 */

const Database  = require('better-sqlite3');
const path = require('path');

// Create (or open) the SQLite database file
const dbPath = path.join(__dirname, 'grant_vessels.db');
const db = new Database(dbPath, { verbose: console.log });

// Create all tables using IF NOT EXISTS so this is safe to run multiple times
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        is_admin INTEGER DEFAULT 0,
        is_approved INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        batch_name TEXT,
        total_wastage_percent REAL,
        output_csv_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS raw_beams_used (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER,
        beam_type INTEGER,
        waste_amount REAL,
        FOREIGN KEY(batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER,
        item_number TEXT,
        length REAL,
        nest_id INTEGER,
        FOREIGN KEY(batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_email TEXT,
        action TEXT,
        detail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
`);

// ---- Migrations ----
// These handle schema changes for databases created before these columns existed.
// The try/catch pattern: try to SELECT the column - if it fails, ALTER TABLE to add it.

try {
    db.prepare('SELECT user_id FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN user_id INTEGER REFERENCES users(id)');
}

try {
    db.prepare('SELECT output_csv_path FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN output_csv_path TEXT');
}

// ---- Seed Data ----
// Insert default accounts if they don't already exist (INSERT OR IGNORE).
// Both use the bcrypt hash of "password" for initial setup.
const adminPasswordHash = '$2a$12$oHYA88q8aRDrAeLkpPNU.uLLNmkssx57OR.XOpvuRpSkSkuUTVE9K';
const userPasswordHash = '$2a$12$oHYA88q8aRDrAeLkpPNU.uLLNmkssx57OR.XOpvuRpSkSkuUTVE9K';

const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, is_admin, is_approved)
    VALUES (?, ?, ?, 1)
`)

// Default admin:  admin@grantvessels.com / password
insertUser.run('admin@grantvessels.com', adminPasswordHash, 1);
// Default user:   user@grantvessels.com / password
insertUser.run('user@grantvessels.com', userPasswordHash, 0);

// ---- Default Global Settings ----
// These provide initial values for the dashboard optimisation parameters
const insertSetting = db.prepare('INSERT OR IGNORE INTO global_settings (key, value) VALUES (?, ?)');
insertSetting.run('default_kerf_mm', '3.0');           // Saw blade width
insertSetting.run('default_min_remnant_mm', '500');     // Minimum usable leftover
insertSetting.run('max_beams_display', '50');            // Max beams shown in cutting layout

module.exports = db;
