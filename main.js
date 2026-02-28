const { app, BrowserWindow, ipcMain } = require('electron');
const db = require('./src/databases/db.js');
const bcrypt = require('bcrypt');
const path = require('path');

// Check if the user is admin
async function isAdmin(userID) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userID);
  return user ? user.is_admin === 1 : false;
}

// Secure user registration (Admin only)
ipcMain.handle('admin:add-user', async (event, { sessionUserID, newUsername, newPassword }) => {
  if (!await isAdmin(sessionUserID)) return { success: false, message: 'Access Denied' };
  
  const hash = await bcrypt.hash(newPassword, 10);
  try {
    const stmt = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)').run(newUsername, hash);
    return { success: true };
  }
  catch (err) {
    return { success: false, message: 'Username already exists' };
  }
});

// Secure user deletion (Admin only)
ipcMain.handle('admin:delete-user', async (event, { sessionUserId, targetUserId }) => {
  if (!await isAdmin(sessionUserId)) return { success: false, message: "Access Denied" };
  
  // Prevent self-deletion
  if (sessionUserId === targetUserId) {
      return { success: false, error: "Admin cannot delete their own account" };
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
  return { success: true };
});

// Handle login
ipcMain.handle('auth:login', async (event, { username, password }) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return { success: false, message: 'Username and Password combination incorrect' };

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return { success: false, message: 'Username and Password combination incorrect' };

    return { success: true, isAdmin: user.is_admin === 1, userID: user.id };
  } 
  catch (err) {
    console.error('Login Error:', err);
    return { success: false, message: 'An error occurred during login. Please try again' };
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
  win.webContents.openDevTools();
}

// Initialise the app
app.whenReady().then((createWindow));