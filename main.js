const { app, BrowserWindow, ipcMain } = require('electron');
const db = require('./src/databases/db.js');
const bcrypt = require('bcryptjs');
const path = require('path');

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
