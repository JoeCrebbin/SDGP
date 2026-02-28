// src/database/db.js
const Database  = require('better-sqlite3');
const path = require('path');

// Store the database file in the user's data directory for security and persistence.
const dbPath = path.join(__dirname, 'grant_vessels.db');
const db = new Database(dbPath, { verbose: console.log });

// Create the tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        is_admin INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_name TEXT,
        total_wastage_percent REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
`);

// Add the default admin user and a standard user if they don't exist
const adminPasswordHash = '$2a$12$oHYA88q8aRDrAeLkpPNU.uLLNmkssx57OR.XOpvuRpSkSkuUTVE9K'; // bcrypt hash for "password"
const userPasswordHash = '$2a$12$oHYA88q8aRDrAeLkpPNU.uLLNmkssx57OR.XOpvuRpSkSkuUTVE9K'; // bcrypt hash for "password"

const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash, is_admin)
    VALUES (?, ?, ?)
`)

insertUser.run('admin', adminPasswordHash, 1); // Insert admin - username: admin, password: password
insertUser.run('ja2-colman', userPasswordHash, 0); // Insert unprivileged user - username: ja2-colman, password: password

module.exports = db;
