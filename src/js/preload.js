const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authAPI', {
    login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
    add_user: (sessionUserID, newUsername, newPassword) => ipcRenderer.invoke('admin:add-user', { sessionUserID, newUsername, newPassword }),
    delete_user: (sessionUserId, targetUserId) => ipcRenderer.invoke('admin:delete-user', { sessionUserId, targetUserId })
});