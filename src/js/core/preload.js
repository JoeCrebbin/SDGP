/*
 * preload.js - Electron Context Bridge
 *
 * This file runs before any renderer (browser) code loads. It creates a safe
 * bridge between the renderer and the main process using contextBridge.
 *
 * Without this, the renderer would have no way to call our backend functions
 * (login, optimise, etc.) because contextIsolation is enabled for security.
 *
 * Each API object (authAPI, optimiseAPI, etc.) exposes specific IPC calls
 * that the renderer pages can use. For example:
 *   - In the renderer: window.authAPI.login(email, password)
 *   - This calls: ipcRenderer.invoke('auth:login', { email, password })
 *   - Which triggers the handler in main.js
 */

const { contextBridge, ipcRenderer } = require('electron');

// Authentication - login, register, check auth status, logout
contextBridge.exposeInMainWorld('authAPI', {
  checkAuth: () => ipcRenderer.invoke('auth:check-auth'),
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  register: (email, password) => ipcRenderer.invoke('auth:register', { email, password }),
  logout: () => ipcRenderer.invoke('auth:logout')
});

// Optimisation - run the cutting stock algorithm
contextBridge.exposeInMainWorld('optimiseAPI', {
  run: (params) => ipcRenderer.invoke('optimise:run', params)
});

// Settings - fetch global default values (kerf, min remnant, etc.)
contextBridge.exposeInMainWorld('settingsAPI', {
  getDefaults: () => ipcRenderer.invoke('settings:get-defaults')
});

// Batch history - list, view details, and search past optimisations
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

// User account management - password change and account deletion
contextBridge.exposeInMainWorld('userAPI', {
  changePassword: (currentPassword, newPassword) =>
    ipcRenderer.invoke('user:change-password', { currentPassword, newPassword }),
  deleteAccount: (password) =>
    ipcRenderer.invoke('user:delete-account', { password })
});

// Admin-only functions - user management, logs, settings, batches
contextBridge.exposeInMainWorld('adminAPI', {
  listUsers: () => ipcRenderer.invoke('admin:list-users'),
  approveUser: (userId) => ipcRenderer.invoke('admin:approve-user', { userId }),
  rejectUser: (userId) => ipcRenderer.invoke('admin:reject-user', { userId }),
  deleteUser: (userId) => ipcRenderer.invoke('admin:delete-user', { userId }),
  listLogs: (search, limit) => ipcRenderer.invoke('admin:list-logs', { search, limit }),
  listAllBatches: (search) => ipcRenderer.invoke('admin:list-all-batches', { search }),
  batchDetail: (batchId) => ipcRenderer.invoke('admin:batch-detail', { batchId }),
  userBatches: (userId) => ipcRenderer.invoke('admin:user-batches', { userId }),
  getSettings: () => ipcRenderer.invoke('admin:get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('admin:update-settings', { settings })
});
