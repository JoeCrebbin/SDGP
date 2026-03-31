/*
 * db.js - Database Setup
 * SDGP 2025/26
 *
 * Sets up the SQLite database using better-sqlite3. Creates all the tables,
 * runs any migrations for when we add new columns, and seeds default
 * accounts so you can log in straight away.
 *
 * Tables:
 *   - users: accounts with email, hashed password, admin flag, approval status
 *   - batches: each optimisation run, linked to a user
 *   - raw_beams_used: tracks beams used per batch
 *   - components: individual cut pieces per batch
 *   - activity_logs: who did what and when (for the admin logs page)
 *   - global_settings: key-value pairs for app defaults
 */

const Database  = require('better-sqlite3');
const path = require('path');

// create or open the database file
const dbPath = path.join(__dirname, 'grant_vessels.db');
const enableSqlDebug = process.env.SDGP_SQL_DEBUG === '1';
const db = new Database(dbPath, { verbose: enableSqlDebug ? console.log : undefined });

// create tables if they dont exist - safe to run multiple times
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user',
        is_admin INTEGER DEFAULT 0,
        is_approved INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        batch_name TEXT,
        solver_name TEXT,
        algorithm_version TEXT,
        priority_mode TEXT,
        kerf_mm REAL,
        min_remnant_mm REAL,
        total_components INTEGER,
        accepted_components INTEGER,
        rejected_components INTEGER,
        metrics_json TEXT,
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

    CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage TEXT,
        size_bucket TEXT,
        row_count INTEGER,
        duration_ms REAL,
        success INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// migrations - these handle adding columns that didnt exist in older versions
// we try to select the column and if it fails we add it
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

try {
    db.prepare('SELECT solver_name FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN solver_name TEXT');
}

try {
    db.prepare('SELECT priority_mode FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN priority_mode TEXT');
}

try {
    db.prepare('SELECT algorithm_version FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN algorithm_version TEXT');
}

try {
    db.prepare('SELECT kerf_mm FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN kerf_mm REAL');
}

try {
    db.prepare('SELECT min_remnant_mm FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN min_remnant_mm REAL');
}

try {
    db.prepare('SELECT total_components FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN total_components INTEGER');
}

try {
    db.prepare('SELECT accepted_components FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN accepted_components INTEGER');
}

try {
    db.prepare('SELECT rejected_components FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN rejected_components INTEGER');
}

try {
    db.prepare('SELECT metrics_json FROM batches LIMIT 1').get();
} catch (e) {
    db.exec('ALTER TABLE batches ADD COLUMN metrics_json TEXT');
}

try {
    db.prepare('SELECT role FROM users LIMIT 1').get();
} catch (e) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
}

// backfill role for older databases that only used is_admin
db.exec(`
    UPDATE users
    SET role = CASE
        WHEN role IS NULL OR TRIM(role) = '' THEN CASE WHEN is_admin = 1 THEN 'admin' ELSE 'user' END
        ELSE role
    END
`);

// ---- Seed Data ----
// Insert default accounts if they don't already exist (INSERT OR IGNORE).
// Both use the bcrypt hash of "password" for initial setup.
const adminPasswordHash = '$2a$12$oHYA88q8aRDrAeLkpPNU.uLLNmkssx57OR.XOpvuRpSkSkuUTVE9K';
const userPasswordHash = '$2a$12$oHYA88q8aRDrAeLkpPNU.uLLNmkssx57OR.XOpvuRpSkSkuUTVE9K';
const managerPasswordHash = '$2a$12$oHYA88q8aRDrAeLkpPNU.uLLNmkssx57OR.XOpvuRpSkSkuUTVE9K';

const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, role, is_admin, is_approved)
    VALUES (?, ?, ?, ?, 1)
`)

// default admin account: admin@grantvessels.com / password
insertUser.run('admin@grantvessels.com', adminPasswordHash, 'admin', 1);
// manager account: manager@grantvessels.com / password
insertUser.run('manager@grantvessels.com', managerPasswordHash, 'manager', 1);
// regular user: user@grantvessels.com / password
insertUser.run('user@grantvessels.com', userPasswordHash, 'user', 0);

// default global settings - these prefill on the dashboard
const insertSetting = db.prepare('INSERT OR IGNORE INTO global_settings (key, value) VALUES (?, ?)');
insertSetting.run('default_kerf_mm', '3.0'); // saw blade width
insertSetting.run('default_min_remnant_mm', '3'); // minimum usable offcut
insertSetting.run('max_beams_display', '50'); // max beams shown in layout

// ensure seeded privileged accounts keep intended roles on upgraded databases
db.prepare("UPDATE users SET role = 'admin', is_admin = 1, is_approved = 1 WHERE email = ?")
    .run('admin@grantvessels.com');
db.prepare("UPDATE users SET role = 'manager', is_admin = 1, is_approved = 1 WHERE email = ?")
    .run('manager@grantvessels.com');

module.exports = db;
