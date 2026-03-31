/*
 * preload.js - Context Bridge Setup
 * SDGP 2025/26
 *
 * This runs before any page code loads and sets up the bridge between
 * the frontend and backend. Without this the renderer cant talk to
 * main.js at all because we have contextIsolation turned on.
 *
 * Basically each API object below exposes specific IPC calls that
 * the pages can use. So like window.authAPI.login() in the renderer
 * triggers the auth:login handler in main.js. We spent a while
 * figuring out how this pattern works but once you get it its pretty clean.
 */

const { contextBridge, ipcRenderer } = require('electron');

// auth - login, register, check if logged in, logout
contextBridge.exposeInMainWorld('authAPI', {
  checkAuth: () => ipcRenderer.invoke('auth:check-auth'),
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  register: (email, password) => ipcRenderer.invoke('auth:register', { email, password }),
  logout: () => ipcRenderer.invoke('auth:logout')
});

// optimiser - kicks off the cutting stock algorithm
contextBridge.exposeInMainWorld('optimiseAPI', {
  run: (params) => ipcRenderer.invoke('optimise:run', params)
});

// settings - grabs the global defaults (kerf, min remnant etc)
contextBridge.exposeInMainWorld('settingsAPI', {
  getDefaults: () => ipcRenderer.invoke('settings:get-defaults')
});

// history - list, view and search past optimisation runs
contextBridge.exposeInMainWorld('historyAPI', {
  list: () => ipcRenderer.invoke('history:list'),
  detail: (batchId) => ipcRenderer.invoke('history:detail', { batchId }),
  search: (search) => ipcRenderer.invoke('history:search', { search }),
  trend: () => ipcRenderer.invoke('history:trend')
});

contextBridge.exposeInMainWorld('exportAPI', {
  securePackage: (payload) => ipcRenderer.invoke('export:secure-package', payload)
});

contextBridge.exposeInMainWorld('nfrAPI', {
  performanceReport: () => ipcRenderer.invoke('nfr:performance-report')
});

// user account stuff - change password and delete account
contextBridge.exposeInMainWorld('userAPI', {
  changePassword: (currentPassword, newPassword) =>
    ipcRenderer.invoke('user:change-password', { currentPassword, newPassword }),
  deleteAccount: (password) =>
    ipcRenderer.invoke('user:delete-account', { password })
});

// file operations - native save dialogs for CSV and PNG exports
contextBridge.exposeInMainWorld('fileAPI', {
  saveCsv: (defaultName, csvContent) => ipcRenderer.invoke('file:save-csv', { defaultName, csvContent }),
  savePng: (defaultName, dataUrl) => ipcRenderer.invoke('file:save-png', { defaultName, dataUrl })
});

// admin only stuff - user management, logs, settings, viewing all batches
contextBridge.exposeInMainWorld('adminAPI', {
  listUsers: () => ipcRenderer.invoke('admin:list-users'),
  approveUser: (userId, role) => ipcRenderer.invoke('admin:approve-user', { userId, role }),
  updateUserRole: (userId, role) => ipcRenderer.invoke('admin:update-user-role', { userId, role }),
  rejectUser: (userId) => ipcRenderer.invoke('admin:reject-user', { userId }),
  deleteUser: (userId) => ipcRenderer.invoke('admin:delete-user', { userId }),
  listLogs: (search, limit) => ipcRenderer.invoke('admin:list-logs', { search, limit }),
  listAllBatches: (search) => ipcRenderer.invoke('admin:list-all-batches', { search }),
  batchDetail: (batchId) => ipcRenderer.invoke('admin:batch-detail', { batchId }),
  userBatches: (userId) => ipcRenderer.invoke('admin:user-batches', { userId }),
  getSettings: () => ipcRenderer.invoke('admin:get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('admin:update-settings', { settings })
});
