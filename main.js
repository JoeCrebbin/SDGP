/*
 * main.js - Electron Main Process
 *
 * This is the entry point for the Electron app. It runs in Node.js (not the browser),
 * so it has access to the filesystem, database, etc. The renderer (browser) side
 * communicates with this file via IPC (Inter-Process Communication) channels.
 *
 * All the backend logic lives here: authentication, optimisation, history, admin, etc.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const db = require('./src/databases/db.js');
const bcrypt = require('bcryptjs');   // Used for hashing and comparing passwords securely
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads'); // Lets us run heavy tasks off the main thread
const { buildEncryptedExport } = require('./src/js/core/secure_export.js');
const { ALGORITHM_VERSION, PERF_TARGETS_MS_P95, bucketByRows } = require('./src/js/core/nfr_contracts.js');

// Safety check - this file only works when run through Electron
if (!process.versions || !process.versions.electron) {
  throw new Error('main.js must be run with Electron. Use "npm.cmd start" (PowerShell) or "npm start".');
}

// Track which user is currently logged in (null = no one)
let loggedInUserID = null;

// Create the output/ folder if it doesn't exist yet - this is where we save CSV results
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

/**
 * Runs the optimisation algorithm inside a Worker Thread.
 * We do this because the algorithm can take a while on large datasets,
 * and running it on the main thread would freeze the entire UI.
 * The worker runs optimiser_worker.js in a separate thread and sends back the result.
 */
function runOptimisationAsync(params) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'src/js/core/optimiser_worker.js'), {
      workerData: params
    });
    worker.on('message', resolve);  // Worker finished successfully
    worker.on('error', reject);     // Worker threw an error
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

/**
 * Helper to check if a given user ID belongs to an admin account.
 * Used to gate admin-only IPC handlers.
 */
async function isAdmin(userID) {
  try {
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userID);
    return user ? user.is_admin === 1 : false;
  }
  catch (err) {
    console.error('Admin Check Error:', err);
    return false;
  }
}

/**
 * Logs an activity to the activity_logs table for the admin System Logs page.
 * Records who did what and when (e.g. "user X ran an optimisation").
 */
function logActivity(userId, action, detail) {
  try {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const email = user ? user.email : 'unknown';
    db.prepare('INSERT INTO activity_logs (user_id, user_email, action, detail) VALUES (?, ?, ?, ?)').run(userId, email, action, detail);
  } catch (e) { console.error('Log error:', e); }
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1000000;
}

function recordPerformance(stage, rowCount, durationMs, success) {
  try {
    db.prepare(
      `INSERT INTO performance_metrics (stage, size_bucket, row_count, duration_ms, success)
       VALUES (?, ?, ?, ?, ?)`
    ).run(stage, bucketByRows(rowCount), rowCount, durationMs, success ? 1 : 0);
  } catch (e) {
    console.error('Performance record error:', e.message);
  }
}

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return Number(sorted[Math.max(0, Math.min(idx, sorted.length - 1))].toFixed(2));
}

// ============================================================
// Authentication IPC Handlers
// These handle login, registration, auth checks, and logout.
// The renderer calls these via window.authAPI (exposed in preload.js).
// ============================================================

// Check if there's a currently logged-in user and whether they're an admin
ipcMain.handle('auth:check-auth', async () => {
  try {
    if(!loggedInUserID) return {
      authenticated: false,
      isAdmin: false
    };

    const adminStatus = await isAdmin(loggedInUserID);

    return {
      authenticated: true,
      isAdmin: adminStatus === true
    };
  }
  catch (err) {
    console.error('Auth Check Error:', err);
    return {
      authenticated: false
    };
  }
});

// Handle login - validates email/password against the database
ipcMain.handle('auth:login', async (event, { email, password }) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) return {
      success: false,
      message: 'Email and Password combination incorrect'
    };

    // Users must be approved by an admin before they can log in
    if (user.is_approved === 0) return {
      success: false,
      message: 'Account pending approval. Please contact an administrator'
    };

    // bcrypt.compare checks the plaintext password against the stored hash
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return {
        success: false,
        message: 'Email and Password combination incorrect'
      };
    }

    // Math.floor ensures the ID is an integer (IPC serialisation can turn it into a float)
    loggedInUserID = Math.floor(user.id);
    logActivity(loggedInUserID, 'login', email);
    return {
      success: true,
      isAdmin: user.is_admin === 1
    };
  }
  catch (err) {
    console.error('Login Error:', err);
    return {
      success: false,
      message: 'An error occurred during login. Please try again'
    };
  }
});

// Handle new user registration
// New users are created with is_approved = 0, so an admin must approve them first
ipcMain.handle('auth:register', async (event, { email, password }) => {
  try {
    // Hash the password with 10 salt rounds before storing
    const hash = await bcrypt.hash(password, 10);

    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, is_admin, is_approved)
      VALUES (?, ?, 0, 0)
    `);
    stmt.run(email, hash);

    return {
      success: true
    };
  }
  catch (err) {
    // UNIQUE constraint on email means this fires if the email already exists
    console.error('Registration Error:', err);
    return {
      success: false,
      message: 'Email already exists'
    };
  }
});

// ============================================================
// Optimisation IPC Handler
// This is the main feature - takes CSV component data, runs the
// bin-packing algorithm, saves results as a CSV file, and stores
// a reference in the database.
// ============================================================

ipcMain.handle('optimise:run', async (event, { batchName, components, kerfMm, minRemnantMm, priority, oldWasteData, validationReport }) => {
  const optimisationStart = nowMs();
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    if (!components || components.length === 0) return { success: false, message: 'No components provided' };

    const priorityMode = priority === 'speed' ? 'speed' : 'waste';

    // Run the selected algorithm in a worker thread
    const result = await runOptimisationAsync({ batchName, components, kerfMm, minRemnantMm, priority: priorityMode });

    // Build the output CSV with one row per component, showing which beam it was assigned to
    const csvRows = ['ItemNumber,NestID,Length_mm,AssignedBeam_mm,BeamIndex,WasteOnBeam_mm,OldWaste_mm'];
    let beamGlobalIndex = 0;
    for (const nestResult of result.results) {
      for (const beam of nestResult.beams) {
        beamGlobalIndex++;
        for (const comp of beam.components) {
          const oldWaste = (oldWasteData && oldWasteData[comp.itemNumber]) || '';
          csvRows.push(
            `${comp.itemNumber},${comp.nestId},${comp.lengthMm},${beam.stockLengthMm},${beamGlobalIndex},${beam.wasteMm},${oldWaste}`
          );
        }
      }
    }
    const csvContent = csvRows.join('\n');

    // Save the CSV file to the output/ directory with a unique timestamp
    const safeName = batchName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'batch';
    const timestamp = Date.now();
    const csvFilename = `${safeName}_${timestamp}_output.csv`;
    const csvPath = path.join(outputDir, csvFilename);
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    // Store batch metadata in the database (we save the file path, not the whole CSV)
    const insertBatch = db.prepare(
      `INSERT INTO batches (
        user_id, batch_name, solver_name, algorithm_version, priority_mode, kerf_mm, min_remnant_mm,
        total_components, accepted_components, rejected_components, metrics_json,
        total_wastage_percent, output_csv_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const metricsJson = JSON.stringify({
      grandTotalBeams: result.grandTotalBeams,
      grandTotalStockMm: result.grandTotalStockMm,
      grandTotalCutMm: result.grandTotalCutMm,
      grandTotalWasteMm: result.grandTotalWasteMm,
      results: result.results,
      validationReport: validationReport || null
    });

    const batchInfo = insertBatch.run(
      loggedInUserID,
      batchName,
      result.solver || null,
      ALGORITHM_VERSION,
      priorityMode,
      kerfMm,
      minRemnantMm,
      validationReport?.totalRows ?? components.length,
      validationReport?.acceptedRows ?? components.length,
      validationReport?.rejectedRows ?? 0,
      metricsJson,
      result.grandWastePct,
      csvPath
    );
    const batchId = Number(batchInfo.lastInsertRowid);
    result.batchId = batchId;
    result.algorithmVersion = ALGORITHM_VERSION;
    result.csvContent = csvContent;  // Send the CSV back to the renderer for display
    logActivity(loggedInUserID, 'optimisation', batchName);

    if (typeof validationReport?.validationDurationMs === 'number') {
      recordPerformance('validation', validationReport.totalRows ?? components.length, validationReport.validationDurationMs, true);
    }
    recordPerformance('optimization', validationReport?.totalRows ?? components.length, nowMs() - optimisationStart, true);

    return { success: true, result };
  } catch (err) {
    console.error('Optimisation Error:', err);
    recordPerformance('optimization', validationReport?.totalRows ?? components?.length ?? 0, nowMs() - optimisationStart, false);
    return { success: false, message: err.message || 'Optimisation failed' };
  }
});

// ============================================================
// Batch History IPC Handlers
// Let users view and search their past optimisation runs.
// ============================================================

// Get all batches for the currently logged-in user, sorted newest first
ipcMain.handle('history:list', async () => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    const batches = db.prepare(
      'SELECT id, batch_name, total_wastage_percent, output_csv_path, created_at FROM batches WHERE user_id = ? ORDER BY created_at DESC'
    ).all(loggedInUserID);

    return { success: true, batches };
  } catch (err) {
    console.error('History List Error:', err);
    return { success: false, message: 'Failed to load history' };
  }
});

// Get the full CSV content for a specific batch (reads the file from disk)
ipcMain.handle('history:detail', async (event, { batchId }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    // Only allow users to view their own batches
    const batch = db.prepare(
      'SELECT * FROM batches WHERE id = ? AND user_id = ?'
    ).get(batchId, loggedInUserID);

    if (!batch) return { success: false, message: 'Batch not found' };

    // Read the CSV file back from disk
    let csvContent = '';
    if (batch.output_csv_path && fs.existsSync(batch.output_csv_path)) {
      csvContent = fs.readFileSync(batch.output_csv_path, 'utf-8');
    }

    return { success: true, batch, csvContent };
  } catch (err) {
    console.error('History Detail Error:', err);
    return { success: false, message: 'Failed to load batch details' };
  }
});

// Search batches by name or date using SQL LIKE pattern matching
ipcMain.handle('history:search', async (event, { search }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    const pattern = '%' + (search || '').trim() + '%';
    const batches = db.prepare(
      'SELECT id, batch_name, total_wastage_percent, output_csv_path, created_at FROM batches WHERE user_id = ? AND (batch_name LIKE ? OR created_at LIKE ?) ORDER BY created_at DESC'
    ).all(loggedInUserID, pattern, pattern);
    return { success: true, batches };
  } catch (err) {
    console.error('History Search Error:', err);
    return { success: false, message: 'Failed to search history' };
  }
});

ipcMain.handle('history:trend', async () => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    const rows = db.prepare(
      `SELECT id, batch_name, total_wastage_percent, created_at
       FROM batches
       WHERE user_id = ?
       ORDER BY created_at ASC`
    ).all(loggedInUserID);
    return { success: true, points: rows };
  } catch (err) {
    console.error('History Trend Error:', err);
    return { success: false, message: 'Failed to load trend data' };
  }
});

ipcMain.handle('nfr:performance-report', async () => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    const rows = db.prepare(
      `SELECT stage, size_bucket, duration_ms
       FROM performance_metrics
       WHERE success = 1
       ORDER BY created_at DESC
       LIMIT 3000`
    ).all();

    const grouped = {};
    for (const row of rows) {
      const key = `${row.stage}:${row.size_bucket}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(Number(row.duration_ms));
    }

    const report = [];
    for (const [key, vals] of Object.entries(grouped)) {
      const [stage, size] = key.split(':');
      report.push({
        stage,
        size,
        samples: vals.length,
        p95Ms: percentile95(vals),
        targetMs: PERF_TARGETS_MS_P95[stage]?.[size] ?? null
      });
    }

    return { success: true, targets: PERF_TARGETS_MS_P95, report };
  } catch (err) {
    console.error('NFR Performance Report Error:', err);
    return { success: false, message: 'Failed to generate performance report' };
  }
});

ipcMain.handle('export:secure-package', async (event, payload) => {
  const exportStart = nowMs();
  let exportSucceeded = false;
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    const password = typeof payload?.password === 'string' ? payload.password : '';
    if (password.length < 8) {
      return { success: false, message: 'Export password must be at least 8 characters' };
    }

    const safeBatch = String(payload?.batchName || 'batch').replace(/[^a-zA-Z0-9_-]/g, '_') || 'batch';
    const exportData = {
      generatedAt: new Date().toISOString(),
      generatedByUserId: loggedInUserID,
      batchName: payload?.batchName || safeBatch,
      cleanedCsv: payload?.cleanedCsv || '',
      validationReport: payload?.validationReport || null,
      optimisationSummary: payload?.optimisationSummary || null,
      chartImageBase64: payload?.chartImageBase64 || null,
      trendImageBase64: payload?.trendImageBase64 || null
    };

    const encrypted = buildEncryptedExport(exportData, password);
    const filename = `${safeBatch}_${Date.now()}_secure_export.gve`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), 'utf8');
    logActivity(loggedInUserID, 'secure_export', filename);

    exportSucceeded = true;
    return {
      success: true,
      filePath,
      filename,
      integritySha256: encrypted.integritySha256
    };
  } catch (err) {
    console.error('Secure Export Error:', err);
    return { success: false, message: `Failed to create secure export package: ${err.message || 'unknown error'}` };
  } finally {
    recordPerformance('export', payload?.validationReport?.totalRows ?? 0, nowMs() - exportStart, exportSucceeded);
  }
});

// ============================================================
// User Account IPC Handlers
// Password changes and account deletion for the logged-in user.
// ============================================================

// Change the logged-in user's password (requires current password verification)
ipcMain.handle('user:change-password', async (event, { currentPassword, newPassword }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(loggedInUserID);
    if (!user) return { success: false, message: 'User not found' };

    // Verify the current password before allowing change
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return { success: false, message: 'Current password is incorrect' };

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, loggedInUserID);

    return { success: true };
  } catch (err) {
    console.error('Change Password Error:', err);
    return { success: false, message: 'Failed to change password' };
  }
});

// Delete the logged-in user's account and all their data
// Uses a transaction to ensure everything is deleted atomically
ipcMain.handle('user:delete-account', async (event, { password }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    const user = db.prepare('SELECT password_hash, is_admin FROM users WHERE id = ?').get(loggedInUserID);
    if (!user) return { success: false, message: 'User not found' };

    // Prevent admin accounts from being deleted through the normal UI
    if (user.is_admin === 1) return { success: false, message: 'Admin accounts cannot be deleted this way' };

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return { success: false, message: 'Password is incorrect' };

    // We need to delete in the right order because of foreign key constraints:
    // raw_beams_used & components -> batches -> users
    const deleteAll = db.transaction(() => {
      const batchRows = db.prepare('SELECT id, output_csv_path FROM batches WHERE user_id = ?').all(loggedInUserID);

      for (const b of batchRows) {
        // Delete child rows first (they reference batch_id)
        db.prepare('DELETE FROM raw_beams_used WHERE batch_id = ?').run(b.id);
        db.prepare('DELETE FROM components WHERE batch_id = ?').run(b.id);

        // Clean up the CSV file from disk
        if (b.output_csv_path && fs.existsSync(b.output_csv_path)) {
          fs.unlinkSync(b.output_csv_path);
        }
      }

      // Now safe to delete batches and the user record
      db.prepare('DELETE FROM batches WHERE user_id = ?').run(loggedInUserID);
      db.prepare('DELETE FROM users WHERE id = ?').run(loggedInUserID);
    });

    deleteAll();
    loggedInUserID = null; // Clear the session

    return { success: true };
  } catch (err) {
    console.error('Delete Account Error:', err);
    return { success: false, message: 'Failed to delete account' };
  }
});

// ============================================================
// Admin IPC Handlers
// These are only accessible to admin users. Each handler checks
// isAdmin() before doing anything.
// ============================================================

// List all registered users (for the User Management page)
ipcMain.handle('admin:list-users', async () => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const users = db.prepare('SELECT id, email, is_admin, is_approved FROM users ORDER BY id').all();
    return { success: true, users };
  } catch (err) {
    console.error('Admin List Users Error:', err);
    return { success: false, message: 'Failed to load users' };
  }
});

// Approve a pending user so they can log in
ipcMain.handle('admin:approve-user', async (event, { userId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    db.prepare('UPDATE users SET is_approved = 1 WHERE id = ?').run(userId);
    logActivity(loggedInUserID, 'approve_user', `Approved user ID ${userId}`);
    return { success: true };
  } catch (err) {
    console.error('Admin Approve User Error:', err);
    return { success: false, message: 'Failed to approve user' };
  }
});

// Reject (delete) a pending user registration
ipcMain.handle('admin:reject-user', async (event, { userId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    // Don't allow deleting admin accounts
    const target = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
    if (target && target.is_admin === 1) return { success: false, message: 'Cannot delete an admin user' };
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logActivity(loggedInUserID, 'reject_user', `Rejected/deleted user ID ${userId}`);
    return { success: true };
  } catch (err) {
    console.error('Admin Reject User Error:', err);
    return { success: false, message: 'Failed to reject user' };
  }
});

// Delete a user and cascade-delete all their data (same pattern as user:delete-account)
ipcMain.handle('admin:delete-user', async (event, { userId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const target = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(userId);
    if (!target) return { success: false, message: 'User not found' };
    if (target.is_admin === 1) return { success: false, message: 'Cannot delete an admin user' };

    const deleteAll = db.transaction(() => {
      const batchRows = db.prepare('SELECT id, output_csv_path FROM batches WHERE user_id = ?').all(userId);
      for (const b of batchRows) {
        db.prepare('DELETE FROM raw_beams_used WHERE batch_id = ?').run(b.id);
        db.prepare('DELETE FROM components WHERE batch_id = ?').run(b.id);
        if (b.output_csv_path && fs.existsSync(b.output_csv_path)) fs.unlinkSync(b.output_csv_path);
      }
      db.prepare('DELETE FROM batches WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
    deleteAll();
    logActivity(loggedInUserID, 'delete_user', `Deleted user ${target.email} (ID ${userId})`);
    return { success: true };
  } catch (err) {
    console.error('Admin Delete User Error:', err);
    return { success: false, message: 'Failed to delete user' };
  }
});

// List activity logs with optional search filtering
ipcMain.handle('admin:list-logs', async (event, { search, limit }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const maxRows = limit || 200;
    let logs;
    if (search && search.trim()) {
      // Search across email, action type, and detail using SQL LIKE
      const pattern = '%' + search.trim() + '%';
      logs = db.prepare('SELECT * FROM activity_logs WHERE user_email LIKE ? OR action LIKE ? OR detail LIKE ? ORDER BY created_at DESC LIMIT ?').all(pattern, pattern, pattern, maxRows);
    } else {
      logs = db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(maxRows);
    }
    return { success: true, logs };
  } catch (err) {
    console.error('Admin List Logs Error:', err);
    return { success: false, message: 'Failed to load logs' };
  }
});

// List ALL batches across ALL users (for the admin All Batches page)
// Joins with users table to show who created each batch
ipcMain.handle('admin:list-all-batches', async (event, { search }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    let batches;
    if (search && search.trim()) {
      const pattern = '%' + search.trim() + '%';
      batches = db.prepare(`
        SELECT b.id, b.batch_name, b.total_wastage_percent, b.output_csv_path, b.created_at, u.email as user_email
        FROM batches b LEFT JOIN users u ON b.user_id = u.id
        WHERE b.batch_name LIKE ? OR u.email LIKE ? OR b.created_at LIKE ?
        ORDER BY b.created_at DESC LIMIT 200
      `).all(pattern, pattern, pattern);
    } else {
      batches = db.prepare(`
        SELECT b.id, b.batch_name, b.total_wastage_percent, b.output_csv_path, b.created_at, u.email as user_email
        FROM batches b LEFT JOIN users u ON b.user_id = u.id
        ORDER BY b.created_at DESC LIMIT 200
      `).all();
    }
    return { success: true, batches };
  } catch (err) {
    console.error('Admin List All Batches Error:', err);
    return { success: false, message: 'Failed to load batches' };
  }
});

// Get full details for any batch (admin can view any user's batch)
ipcMain.handle('admin:batch-detail', async (event, { batchId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
    if (!batch) return { success: false, message: 'Batch not found' };
    let csvContent = '';
    if (batch.output_csv_path && fs.existsSync(batch.output_csv_path)) {
      csvContent = fs.readFileSync(batch.output_csv_path, 'utf-8');
    }
    return { success: true, batch, csvContent };
  } catch (err) {
    console.error('Admin Batch Detail Error:', err);
    return { success: false, message: 'Failed to load batch' };
  }
});

// Get/update global settings (key-value pairs stored in global_settings table)
ipcMain.handle('admin:get-settings', async () => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const rows = db.prepare('SELECT key, value FROM global_settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    return { success: true, settings };
  } catch (err) {
    console.error('Admin Get Settings Error:', err);
    return { success: false, message: 'Failed to load settings' };
  }
});

// Save updated global settings using INSERT OR REPLACE (upsert pattern)
ipcMain.handle('admin:update-settings', async (event, { settings }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const upsert = db.prepare('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)');
    const updateAll = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        upsert.run(key, String(value));
      }
    });
    updateAll();
    logActivity(loggedInUserID, 'update_settings', JSON.stringify(settings));
    return { success: true };
  } catch (err) {
    console.error('Admin Update Settings Error:', err);
    return { success: false, message: 'Failed to update settings' };
  }
});

// Get default settings for any authenticated user (used by the dashboard to
// pre-fill kerf and min remnant values from the global config)
ipcMain.handle('settings:get-defaults', async () => {
  try {
    if (!loggedInUserID) return { success: false };
    const rows = db.prepare('SELECT key, value FROM global_settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    return { success: true, settings };
  } catch (err) {
    return { success: false };
  }
});

// List batches for a specific user (admin only - used in User Management)
ipcMain.handle('admin:user-batches', async (event, { userId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const batches = db.prepare(
      'SELECT id, batch_name, total_wastage_percent, output_csv_path, created_at FROM batches WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
    return { success: true, batches };
  } catch (err) {
    console.error('Admin User Batches Error:', err);
    return { success: false, message: 'Failed to load batches' };
  }
});

// Clear server-side session on logout
ipcMain.handle('auth:logout', async () => {
  loggedInUserID = null;
  return { success: true };
});

// ============================================================
// Window Creation & App Lifecycle
// ============================================================

// Create the main application window with security settings
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'src/js/core/preload.js'),
      contextIsolation: true,     // Keeps renderer and Node.js contexts separate (security)
      nodeIntegration: false,     // Renderer can't use require() directly (security)
      sandbox: false              // Required for worker_threads to work in preload context
    }
  });

  win.loadFile(path.join(__dirname, 'src/html/index.html'));
  //win.webContents.openDevTools(); // Uncomment this line to open DevTools for debugging
}

// Start the app once Electron is ready
app.whenReady().then((createWindow));
