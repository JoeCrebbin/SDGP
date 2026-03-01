const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authAPI', {
  checkAuth: () => ipcRenderer.invoke('auth:check-auth'),
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  register: (email, password) => ipcRenderer.invoke('auth:register', { email, password })
});