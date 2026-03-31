const { app, BrowserWindow, ipcMain } = require('electron');
const db = require('./src/databases/db.js');
const bcrypt = require('bcryptjs');
const path = require('path');

function toPositiveNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseRow(row) {
  const length = toPositiveNumber(row.length);
  const totalLength = toPositiveNumber(row.totalLength);

  if (!length || !totalLength) {
    return null;
  }

  return {
    itemNumber: String(row.itemNumber || '').trim() || 'UNKNOWN',
    nestId: String(row.nestId || 'UNASSIGNED').trim() || 'UNASSIGNED',
    length,
    totalLength
  };
}

function pickStockLength(required, stockLengths) {
  const sorted = [...stockLengths].sort((a, b) => a - b);
  const selected = sorted.find((len) => len >= required);
  return selected || sorted[sorted.length - 1] || required;
}

function optimiseBatch(rows, kerfMm, minRemnantMm) {
  const groupedByNest = rows.reduce((acc, row) => {
    if (!acc[row.nestId]) {
      acc[row.nestId] = [];
    }
    acc[row.nestId].push(row);
    return acc;
  }, {});

  const nestResults = [];
  const beamMix = new Map();
  let totalStock = 0;
  let totalCut = 0;
  let totalWaste = 0;
  let reusableRemnants = 0;

  Object.entries(groupedByNest).forEach(([nestId, components]) => {
    const sortedComponents = [...components].sort((a, b) => b.length - a.length);
    const stockLengths = [...new Set(components.map((c) => c.totalLength).filter((v) => v > 0))];
    const beams = [];

    sortedComponents.forEach((component) => {
      const needed = component.length + kerfMm;
      let bestBeamIndex = -1;
      let bestRemaining = Number.POSITIVE_INFINITY;

      beams.forEach((beam, index) => {
        const remaining = beam.stockLength - (beam.used + needed);
        if (remaining >= 0 && remaining < bestRemaining) {
          bestRemaining = remaining;
          bestBeamIndex = index;
        }
      });

      if (bestBeamIndex === -1) {
        const stockLength = pickStockLength(needed, stockLengths);
        beams.push({
          stockLength,
          used: 0,
          components: []
        });
        bestBeamIndex = beams.length - 1;
      }

      const selectedBeam = beams[bestBeamIndex];
      selectedBeam.components.push(component);
      selectedBeam.used += needed;
    });

    let nestStock = 0;
    let nestCut = 0;
    let nestWaste = 0;

    beams.forEach((beam) => {
      const waste = Math.max(0, beam.stockLength - beam.used);
      nestStock += beam.stockLength;
      nestCut += beam.used;
      nestWaste += waste;

      if (waste >= minRemnantMm) {
        reusableRemnants += 1;
      }

      beamMix.set(beam.stockLength, (beamMix.get(beam.stockLength) || 0) + 1);
    });

    totalStock += nestStock;
    totalCut += nestCut;
    totalWaste += nestWaste;

    nestResults.push({
      nestId,
      pieces: components.length,
      beams: beams.length,
      stockMm: nestStock,
      cutMm: nestCut,
      wasteMm: nestWaste,
      wastePct: nestStock > 0 ? Number(((nestWaste / nestStock) * 100).toFixed(2)) : 0
    });
  });

  return {
    summary: {
      nests: nestResults.length,
      components: rows.length,
      beams: [...beamMix.values()].reduce((acc, count) => acc + count, 0),
      totalStockMm: totalStock,
      totalCutMm: totalCut,
      totalWasteMm: totalWaste,
      totalWastePct: totalStock > 0 ? Number(((totalWaste / totalStock) * 100).toFixed(2)) : 0,
      reusableRemnants
    },
    beamMix: Array.from(beamMix.entries()).map(([stockLength, count]) => ({ stockLength, count })),
    perNest: nestResults
  };
}

function saveOptimizationRun(batchName, runResult, rows) {
  const insertBatch = db.prepare(`
    INSERT INTO batches (batch_name, total_wastage_percent)
    VALUES (?, ?)
  `);

  const insertBeam = db.prepare(`
    INSERT INTO raw_beams_used (batch_id, beam_type, waste_amount)
    VALUES (?, ?, ?)
  `);

  const insertComponent = db.prepare(`
    INSERT INTO components (batch_id, item_number, length, nest_id)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const batchInsertResult = insertBatch.run(batchName, runResult.summary.totalWastePct);
    const batchId = batchInsertResult.lastInsertRowid;

    runResult.beamMix.forEach((beam) => {
      insertBeam.run(batchId, beam.stockLength, 0);
    });

    rows.forEach((row) => {
      insertComponent.run(batchId, row.itemNumber, row.length, row.nestId);
    });

    return batchId;
  });

  return transaction();
}

if (!process.versions || !process.versions.electron) {
  throw new Error('main.js must be run with Electron. Use "npm.cmd start" (PowerShell) or "npm start".');
}

let loggedInUserID = null;

// Check if the user is admin
async function isAdmin(userID) {
  try {
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userID); // Fetch the user's admin status
    return user ? user.is_admin === 1 : false;
  }
  catch (err) {
    console.error('Admin Check Error:', err);
    return false;
  }
}

// Check authentication status
ipcMain.handle('auth:check-auth', async () => {
  try {
    // If no user is logged in, return unauthenticated status
    if(!loggedInUserID) return {
      authenticated: false,
      isAdmin: false
    };

    const adminStatus = await isAdmin(loggedInUserID); // Check if the logged-in user is an admin

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

// Handle Login
ipcMain.handle('auth:login', async (event, { email, password }) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email); // Fetch user by email

    // Check if user exists
    if (!user) return {
      success: false,
      message: 'Email and Password combination incorrect'
    };

    // Check if account is approved
    if (user.is_approved === 0) return {
      success: false,
      message: 'Account pending approval. Please contact an administrator'
    };

    // Compare the provided password with the stored hash
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return {
        success: false,
        message: 'Email and Password combination incorrect'
      };
    }

    // Successful login
    loggedInUserID = user.id; // Store the logged-in user's ID in memory for session management
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

// Handle registration (Self-registration, requires admin approval)
ipcMain.handle('auth:register', async (event, { email, password }) => {
  try {
    const hash = await bcrypt.hash(password, 10); // Hash the password

    // Insert the new user into the database
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
    console.error('Registration Error:', err);
    return {
      success: false,
      message: 'Email already exists'
    };
  }
});

ipcMain.handle('optimisation:run', async (event, payload) => {
  try {
    if (!loggedInUserID) {
      return {
        success: false,
        message: 'You must be logged in to run optimisation'
      };
    }

    const rows = Array.isArray(payload?.rows) ? payload.rows.map(parseRow).filter(Boolean) : [];

    if (rows.length === 0) {
      return {
        success: false,
        message: 'No valid component rows were found in the uploaded CSV'
      };
    }

    const kerfMm = Math.max(0, toPositiveNumber(payload?.kerfMm, 0));
    const minRemnantMm = Math.max(0, toPositiveNumber(payload?.minRemnantMm, 0));
    const batchName = String(payload?.batchName || '').trim() || `Batch_${Date.now()}`;

    const runResult = optimiseBatch(rows, kerfMm, minRemnantMm);
    const batchId = saveOptimizationRun(batchName, runResult, rows);

    return {
      success: true,
      message: 'Optimisation completed successfully',
      batchId,
      batchName,
      runResult
    };
  }
  catch (err) {
    console.error('Optimisation Error:', err);
    return {
      success: false,
      message: 'An error occurred while running optimisation'
    };
  }
});

// Create the main application window
const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'src/js/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'src/html/index.html'));
  //win.webContents.openDevTools();
}

// Initialise the app
app.whenReady().then((createWindow));
