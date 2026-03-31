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
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userID);
    return user ? user.is_admin === 1 : false;
  }
  catch (err) {
    console.error('Admin Check Error:', err);
    return false;
  }
}

// logs stuff to the activity_logs table so admins can see what happened
function logActivity(userId, action, detail) {
  try {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const email = user ? user.email : 'unknown';
    db.prepare('INSERT INTO activity_logs (user_id, user_email, action, detail) VALUES (?, ?, ?, ?)').run(userId, email, action, detail);
  } catch (e) { console.error('Log error:', e); }
}

// ============================================================

// Auth handlers - login, register, check session, logout
// The renderer calls these through window.authAPI (see preload.js)

// check if theres someone logged in and if theyre admin
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

// register a new user - they start unapproved so admin has to let them in
ipcMain.handle('auth:register', async (event, { email, password }) => {
  try {
    // hash with 10 salt rounds
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

ipcMain.handle('optimise:run', async (event, { batchName, components, kerfMm, minRemnantMm, oldWasteData }) => {
  try {
    if (!loggedInUserID) return { success: false, message: 'Not authenticated' };
    if (!components || components.length === 0) return { success: false, message: 'No components provided' };

    // run BFD in a worker thread so it doesnt block the UI
    const result = await runOptimisationAsync({ batchName, components, kerfMm, minRemnantMm, priority: 'waste' });

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
      'INSERT INTO batches (user_id, batch_name, total_wastage_percent, output_csv_path) VALUES (?, ?, ?, ?)'
    );

    const batchInfo = insertBatch.run(loggedInUserID, batchName, result.grandWastePct, csvPath);
    const batchId = Number(batchInfo.lastInsertRowid);
    result.batchId = batchId;
    result.csvContent = csvContent;
    logActivity(loggedInUserID, 'optimisation', batchName);

    return { success: true, result };
  } catch (err) {
    console.error('Optimisation Error:', err);
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
      'SELECT id, batch_name, total_wastage_percent, output_csv_path, created_at FROM batches WHERE user_id = ? ORDER BY created_at DESC'
    ).all(loggedInUserID);

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

    // only let users see their own batches
    const batch = db.prepare(
      'SELECT * FROM batches WHERE id = ? AND user_id = ?'
    ).get(batchId, loggedInUserID);

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
      'SELECT id, batch_name, total_wastage_percent, output_csv_path, created_at FROM batches WHERE user_id = ? AND (batch_name LIKE ? OR created_at LIKE ?) ORDER BY created_at DESC'
    ).all(loggedInUserID, pattern, pattern);
    return { success: true, batches };
  } catch (err) {
    console.error('History Search Error:', err);
    return { success: false, message: 'Failed to search history' };
  }
});

// ============================================================

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

    const user = db.prepare('SELECT password_hash, is_admin FROM users WHERE id = ?').get(loggedInUserID);
    if (!user) return { success: false, message: 'User not found' };

    // dont let admins delete themselves through the normal UI
    if (user.is_admin === 1) return { success: false, message: 'Admin accounts cannot be deleted this way' };

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
    const users = db.prepare('SELECT id, email, is_admin, is_approved FROM users ORDER BY id').all();
    return { success: true, users };
  } catch (err) {
    console.error('Admin List Users Error:', err);
    return { success: false, message: 'Failed to load users' };
  }
});

// approve a pending user so they can actually log in
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

// reject a pending user (basically just deletes them)
ipcMain.handle('admin:reject-user', async (event, { userId }) => {
  try {
    if (!loggedInUserID || !(await isAdmin(loggedInUserID))) return { success: false, message: 'Unauthorized' };
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

// delete a user and all their data (same cascade pattern as account self-delete)
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
