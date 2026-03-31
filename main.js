/*
 * main.js - Electron Main Process
 * SDGP 2025/26
 *
 * This is basically the backend of our app. It runs in Node not the browser
 * so it can do stuff like talk to the database and read/write files.
 * The frontend (renderer) talks to this through IPC channels which is
 * Electrons way of letting the two sides communicate.
 *
 * All the actual logic lives here - auth, running the optimiser,
 * saving results, admin stuff etc.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const db = require('./src/databases/db.js');
const bcrypt = require('bcryptjs');   // for hashing passwords so we dont store them in plain text
const path = require('path');
const fs = require('fs');
const { buildEncryptedExport } = require('./src/js/core/secure_export.js');
const { ALGORITHM_VERSION, PERF_TARGETS_MS_P95, bucketByRows } = require('./src/js/core/nfr_contracts.js');
const { Worker } = require('worker_threads'); // runs heavy stuff off the main thread so the UI doesnt freeze

// this will crash if you try to run it with regular node instead of electron
if (!process.versions || !process.versions.electron) {
  throw new Error('main.js must be run with Electron. Use "npm.cmd start" (PowerShell) or "npm start".');
}

// keeps track of whos logged in - null means no one
let loggedInUserID = null;

// make sure the output folder exists for saving CSV results
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

/*
 * Runs the optimiser in a worker thread so the app doesnt hang
 * while its crunching numbers. The worker runs optimiser_worker.js
 * in a separate thread and sends the result back when its done.
 */
function runOptimisationAsync(params) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'src/js/core/optimiser_worker.js'), {
      workerData: params
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

// quick helper to check if someone is an admin
async function isAdmin(userID) {
  try {
    const user = db.prepare('SELECT role, is_admin FROM users WHERE id = ?').get(userID);
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    return role === 'admin' || role === 'manager' || user.is_admin === 1;
  }
  catch (err) {
    console.error('Admin Check Error:', err);
    return false;
  }
}

async function isManager(userID) {
  try {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userID);
    return user ? String(user.role || '').toLowerCase() === 'manager' : false;
  } catch (err) {
    console.error('Manager Check Error:', err);
    return false;
  }
}

function normalizeRole(role) {
  const value = String(role || 'user').trim().toLowerCase();
  if (value === 'manager') return 'manager';
  if (value === 'admin') return 'admin';
  return 'user';
}

const COMPANY_LOCATIONS = ['Bristol', 'Leeds', 'London', 'Manchester', 'Glasgow', 'Southampton', 'Liverpool'];

function normalizeLocation(location) {
  const value = String(location || '').trim().toLowerCase();
  const match = COMPANY_LOCATIONS.find((entry) => entry.toLowerCase() === value);
  return match || null;
}

// logs stuff to the activity_logs table so admins can see what happened
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

async function verifyActingUserPassword(plainPassword) {
  if (!loggedInUserID) return false;
  const normalized = typeof plainPassword === 'string' ? plainPassword.trim() : '';
  if (!normalized) return false;
  const actingUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(loggedInUserID);
  if (!actingUser) return false;
  return bcrypt.compare(normalized, actingUser.password_hash);
}

// ============================================================

// Auth handlers - login, register, check session, logout
// The renderer calls these through window.authAPI (see preload.js)

// check if theres someone logged in and if theyre admin
ipcMain.handle('auth:check-auth', async () => {
  try {
    if(!loggedInUserID) return {
      authenticated: false,
      isAdmin: false,
      isManager: false,
      userId: null
    };

    const adminStatus = await isAdmin(loggedInUserID);
    const managerStatus = await isManager(loggedInUserID);

    return {
      authenticated: true,
      userId: loggedInUserID,
      isAdmin: adminStatus === true,
      isManager: managerStatus === true
    };
  }
  catch (err) {
    console.error('Auth Check Error:', err);
    return {
      authenticated: false
    };
  }
});

// handle login - check email/password against the db
ipcMain.handle('auth:login', async (event, { email, password }) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) return {
      success: false,
      message: 'Email and Password combination incorrect'
    };

    // users need to be approved by admin before they can get in
    if (user.is_approved === 0) return {
      success: false,
      message: 'Account pending approval. Please contact an administrator'
    };

    // bcrypt compares the plain text password against the stored hash
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return {
        success: false,
        message: 'Email and Password combination incorrect'
      };
    }

    // Math.floor because IPC can sometimes turn ints into floats apparently
    loggedInUserID = Math.floor(user.id);
    logActivity(loggedInUserID, 'login', email);
    return {
      success: true,
      isAdmin: await isAdmin(loggedInUserID),
      isManager: await isManager(loggedInUserID),
      role: normalizeRole(user.role)
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

// register a new user - they start unapproved so admin has to let them in
ipcMain.handle('auth:register', async (event, { email, password, location }) => {
  try {
    const normalizedLocation = normalizeLocation(location);
    if (!normalizedLocation) {
      return {
        success: false,
        message: 'Please select a valid company location'
      };
    }

    // hash with 10 salt rounds
    const hash = await bcrypt.hash(password, 10);

    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, location, role, is_admin, is_approved)
      VALUES (?, ?, ?, 'user', 0, 0)
    `);
    stmt.run(email, hash, normalizedLocation);

    return {
      success: true
    };
  }
  catch (err) {
    // unique constraint on email so this fires if they already registered
    console.error('Registration Error:', err);
    return {
      success: false,
      message: 'Email already exists'
    };
  }
});

// ============================================================

// Optimisation handler - this is the main feature of the app
// Takes CSV data, runs the bin packing algo, saves results

ipcMain.handle('optimise:run', async (event, { batchName, components, kerfMm, minRemnantMm, priority, oldWasteData, validationReport }) => {
  const optimisationStart = nowMs();
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    if (!components || components.length === 0) return { success: false, message: 'No components provided' };
    const priorityMode = priority === 'speed' ? 'speed' : 'waste';

    // run optimisation in a worker thread so it doesnt block the UI
    const result = await runOptimisationAsync({ batchName, components, kerfMm, minRemnantMm, priority: priorityMode });

    // build the output CSV - one row per component showing which beam it got put on
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

    // save the CSV to disk with a timestamp so filenames are unique
    const safeName = batchName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'batch';
    const timestamp = Date.now();
    const csvFilename = `${safeName}_${timestamp}_output.csv`;
    const csvPath = path.join(outputDir, csvFilename);
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    // store the batch info in the database (just the file path, not the whole CSV)
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
    result.csvContent = csvContent;
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

// Batch History handlers - lets users look at their past runs

// get all batches for the logged in user, newest first
ipcMain.handle('history:list', async () => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    const batches = db.prepare(
      `SELECT b.id, b.batch_name, b.total_wastage_percent, b.output_csv_path, b.created_at,
              u.email AS owner_email, u.location AS owner_location,
              CASE WHEN b.user_id = ? THEN 1 ELSE 0 END AS is_own
       FROM batches b
       JOIN users u ON b.user_id = u.id
       JOIN users me ON me.id = ?
       WHERE LOWER(TRIM(u.location)) = LOWER(TRIM(me.location))
       ORDER BY b.created_at DESC`
    ).all(loggedInUserID, loggedInUserID);

    return { success: true, batches };
  } catch (err) {
    console.error('History List Error:', err);
    return { success: false, message: 'Failed to load history' };
  }
});

// get the full CSV for a specific batch (reads the file back from disk)
ipcMain.handle('history:detail', async (event, { batchId }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    // allow users to see their own and colleagues' batches from the same location
    const batch = db.prepare(
      `SELECT b.*
       FROM batches b
       JOIN users owner ON owner.id = b.user_id
       JOIN users me ON me.id = ?
       WHERE b.id = ?
         AND LOWER(TRIM(owner.location)) = LOWER(TRIM(me.location))`
    ).get(loggedInUserID, batchId);

    if (!batch) return { success: false, message: 'Batch not found' };

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

// search batches by name or date
ipcMain.handle('history:search', async (event, { search }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    const pattern = '%' + (search || '').trim() + '%';
    const batches = db.prepare(
      `SELECT b.id, b.batch_name, b.total_wastage_percent, b.output_csv_path, b.created_at,
              u.email AS owner_email, u.location AS owner_location,
              CASE WHEN b.user_id = ? THEN 1 ELSE 0 END AS is_own
       FROM batches b
       JOIN users u ON b.user_id = u.id
       JOIN users me ON me.id = ?
       WHERE LOWER(TRIM(u.location)) = LOWER(TRIM(me.location))
         AND (b.batch_name LIKE ? OR b.created_at LIKE ? OR u.email LIKE ?)
       ORDER BY b.created_at DESC`
    ).all(loggedInUserID, loggedInUserID, pattern, pattern, pattern);
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
      `SELECT b.id, b.batch_name, b.total_wastage_percent, b.created_at
       FROM batches b
       JOIN users owner ON owner.id = b.user_id
       JOIN users me ON me.id = ?
       WHERE LOWER(TRIM(owner.location)) = LOWER(TRIM(me.location))
       ORDER BY b.created_at ASC`
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

// User account stuff - change password, delete account

// change password (need to verify current one first obviously)
ipcMain.handle('user:change-password', async (event, { currentPassword, newPassword }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(loggedInUserID);
    if (!user) return { success: false, message: 'User not found' };

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

// delete account and all associated data
// uses a transaction so everything gets deleted together or not at all
ipcMain.handle('user:delete-account', async (event, { password }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };

    const user = db.prepare('SELECT password_hash, role, is_admin FROM users WHERE id = ?').get(loggedInUserID);
    if (!user) return { success: false, message: 'User not found' };

    // dont let privileged accounts delete themselves through the normal UI
    if (normalizeRole(user.role) === 'admin' || normalizeRole(user.role) === 'manager' || user.is_admin === 1) {
      return { success: false, message: 'Admin or manager accounts cannot be deleted this way' };
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return { success: false, message: 'Password is incorrect' };

    // have to delete in the right order because of foreign keys
    const deleteAll = db.transaction(() => {
      const batchRows = db.prepare('SELECT id, output_csv_path FROM batches WHERE user_id = ?').all(loggedInUserID);

      for (const b of batchRows) {
        db.prepare('DELETE FROM raw_beams_used WHERE batch_id = ?').run(b.id);
        db.prepare('DELETE FROM components WHERE batch_id = ?').run(b.id);

        // clean up the CSV files from disk too
        if (b.output_csv_path && fs.existsSync(b.output_csv_path)) {
          fs.unlinkSync(b.output_csv_path);
        }
      }

      db.prepare('DELETE FROM batches WHERE user_id = ?').run(loggedInUserID);
      db.prepare('DELETE FROM users WHERE id = ?').run(loggedInUserID);
    });

    deleteAll();
    loggedInUserID = null;

    return { success: true };
  } catch (err) {
    console.error('Delete Account Error:', err);
    return { success: false, message: 'Failed to delete account' };
  }
});

// ============================================================

// Admin handlers - only work if youre an admin
// Each one checks isAdmin() before doing anything

// list all users for the user management page
ipcMain.handle('admin:list-users', async () => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const users = db.prepare(
      `SELECT id, email, location, role, is_admin, is_approved
       FROM users
       ORDER BY id`
    ).all().map((u) => ({
      ...u,
      role: normalizeRole(u.role || (u.is_admin === 1 ? 'admin' : 'user'))
    }));
    return { success: true, users };
  } catch (err) {
    console.error('Admin List Users Error:', err);
    return { success: false, message: 'Failed to load users' };
  }
});

// approve a pending user so they can actually log in
ipcMain.handle('admin:approve-user', async (event, { userId, role, actingPassword }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const passwordOk = await verifyActingUserPassword(actingPassword);
    if (!passwordOk) return { success: false, message: 'Password confirmation failed' };

    const requesterIsManager = await isManager(loggedInUserID);
    const targetRole = normalizeRole(role);
    if (targetRole === 'admin' && !requesterIsManager) {
      return { success: false, message: 'Only managers can assign Admin role' };
    }
    if (targetRole === 'manager' && !requesterIsManager) {
      return { success: false, message: 'Only managers can assign Manager role' };
    }

    const isAdminFlag = targetRole === 'admin' || targetRole === 'manager' ? 1 : 0;
    db.prepare('UPDATE users SET is_approved = 1, role = ?, is_admin = ? WHERE id = ?').run(targetRole, isAdminFlag, userId);
    logActivity(loggedInUserID, 'approve_user', `Approved user ID ${userId} as ${targetRole}`);
    return { success: true };
  } catch (err) {
    console.error('Admin Approve User Error:', err);
    return { success: false, message: 'Failed to approve user' };
  }
});

ipcMain.handle('admin:update-user-role', async (event, { userId, role, actingPassword }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const targetUserId = Number(userId);
    if (!Number.isFinite(targetUserId)) return { success: false, message: 'Invalid user ID' };
    if (targetUserId === Number(loggedInUserID)) {
      return { success: false, message: 'You cannot change your own role' };
    }

    const passwordOk = await verifyActingUserPassword(actingPassword);
    if (!passwordOk) return { success: false, message: 'Password confirmation failed' };

    const requesterIsManager = await isManager(loggedInUserID);
    const targetRole = normalizeRole(role);

    if (targetRole === 'admin' && !requesterIsManager) {
      return { success: false, message: 'Only managers can assign Admin role' };
    }
    if (targetRole === 'manager' && !requesterIsManager) {
      return { success: false, message: 'Only managers can assign Manager role' };
    }

    const targetUser = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) return { success: false, message: 'User not found' };
    if (normalizeRole(targetUser.role) === 'manager' && !requesterIsManager) {
      return { success: false, message: 'Only managers can modify manager accounts' };
    }

    const isAdminFlag = targetRole === 'admin' || targetRole === 'manager' ? 1 : 0;
    db.prepare('UPDATE users SET role = ?, is_admin = ? WHERE id = ?').run(targetRole, isAdminFlag, targetUserId);
    logActivity(loggedInUserID, 'update_user_role', `User ID ${targetUserId} role changed to ${targetRole}`);
    return { success: true };
  } catch (err) {
    console.error('Admin Update User Role Error:', err);
    return { success: false, message: 'Failed to update role' };
  }
});

// reject a pending user (basically just deletes them)
ipcMain.handle('admin:reject-user', async (event, { userId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const requesterIsManager = await isManager(loggedInUserID);
    const target = db.prepare('SELECT role, is_admin FROM users WHERE id = ?').get(userId);
    const targetRole = normalizeRole(target?.role || (target?.is_admin === 1 ? 'admin' : 'user'));
    if (targetRole === 'manager' && !requesterIsManager) {
      return { success: false, message: 'Only managers can delete manager users' };
    }
    if (targetRole === 'admin' && !requesterIsManager) {
      return { success: false, message: 'Only managers can delete admin users' };
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logActivity(loggedInUserID, 'reject_user', `Rejected/deleted user ID ${userId}`);
    return { success: true };
  } catch (err) {
    console.error('Admin Reject User Error:', err);
    return { success: false, message: 'Failed to reject user' };
  }
});

// delete a user and all their data (same cascade pattern as account self-delete)
ipcMain.handle('admin:delete-user', async (event, { userId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const requesterIsManager = await isManager(loggedInUserID);
    const target = db.prepare('SELECT role, is_admin, email FROM users WHERE id = ?').get(userId);
    if (!target) return { success: false, message: 'User not found' };
    const targetRole = normalizeRole(target.role || (target.is_admin === 1 ? 'admin' : 'user'));
    if (targetRole === 'manager' && !requesterIsManager) return { success: false, message: 'Only managers can delete manager users' };
    if (targetRole === 'admin' && !requesterIsManager) return { success: false, message: 'Only managers can delete admin users' };

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

// get activity logs with optional search
ipcMain.handle('admin:list-logs', async (event, { search, limit }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
    const maxRows = limit || 200;
    let logs;
    if (search && search.trim()) {
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

// list ALL batches across ALL users (admin only)
// joins with users table to show who made each one
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

// get full details for any batch (admin can see anyones)
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

// get and update global settings (key-value pairs)
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

// save settings using upsert (INSERT OR REPLACE)
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

// any logged in user can grab the default settings (dashboard uses this to prefill kerf etc)
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

// list batches for a specific user (admin only - used in user management)
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

// save CSV using the native OS file picker dialog
ipcMain.handle('file:save-csv', async (event, { defaultName, csvContent }) => {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return { success: false, message: 'Cancelled' };
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    console.error('File Save Error:', err);
    return { success: false, message: err.message };
  }
});

// save PNG chart image using native file picker
ipcMain.handle('file:save-png', async (event, { defaultName, dataUrl }) => {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'PNG Images', extensions: ['png'] }]
    });
    if (canceled || !filePath) return { success: false, message: 'Cancelled' };
    // strip the data URL prefix and decode the base64 to write the actual PNG bytes
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { success: true, filePath };
  } catch (err) {
    console.error('File Save Error:', err);
    return { success: false, message: err.message };
  }
});

// clear the session on logout
ipcMain.handle('auth:logout', async () => {
  loggedInUserID = null;
  return { success: true };
});

// ============================================================

// Window setup and app lifecycle

// create the main window with security stuff enabled
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'src/js/core/preload.js'),
      contextIsolation: true, // keeps renderer and node separate for security
      nodeIntegration: false, // renderer cant use require() directly
      sandbox: false // needed for worker_threads to work
    }
  });

  win.loadFile(path.join(__dirname, 'src/html/index.html'));
  //win.webContents.openDevTools(); // uncomment for debugging
}

// start the app when electron is ready
app.whenReady().then((createWindow));
