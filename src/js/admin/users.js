/*
 * admin/users.js - User Management Page (Admin)
 * SDGP 2025/26
 *
 * This is the admin page for managing users. You can approve or reject
 * pending registrations, view all users, delete accounts (except admins
 * obviously), and look at a specific users batch history.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const pendingBody = document.getElementById('pending-body');
    const usersBody = document.getElementById('users-body');
    const msg = document.getElementById('admin-message');
    const allUsersTitle = document.getElementById('all-users-title');
    const authState = await window.authAPI.checkAuth();
    const canAssignAdmin = authState?.isManager === true;

    function buildRoleOptions(selectedRole) {
        const current = String(selectedRole || 'user').toLowerCase();
        const adminOption = canAssignAdmin ? '<option value="admin">Admin</option>' : '';
        const managerOption = canAssignAdmin ? '<option value="manager">Manager</option>' : '';
        return `
            <option value="user" ${current === 'user' ? 'selected' : ''}>User</option>
            ${adminOption.replace('>', current === 'admin' ? ' selected>' : '>')}
            ${managerOption.replace('>', current === 'manager' ? ' selected>' : '>')}
        `;
    }

    // fetch all users and populate both tables - pending approvals and all users
    async function loadUsers() {
        try {
            const response = await window.adminAPI.listUsers();
            if (!response.success) {
                usersBody.innerHTML = '<tr><td colspan="6">Failed to load users.</td></tr>';
                return;
            }

            const pending = response.users.filter(u => u.is_approved === 0);
            const all = response.users;

            if (allUsersTitle) {
                allUsersTitle.textContent = `All Users (${all.length})`;
            }

            // pending approvals table
            if (pending.length === 0) {
                pendingBody.innerHTML = '<tr><td colspan="3">No pending approvals.</td></tr>';
            } else {
                pendingBody.innerHTML = '';
                for (const user of pending) {
                    const row = document.createElement('tr');
                    const pendingRole = String(user.role || 'user').toLowerCase();
                    row.innerHTML = `
                        <td>${escapeHtml(user.email)}</td>
                        <td>
                            <select class="pending-role-select" data-id="${user.id}" style="width:auto; min-width:120px;">
                                ${buildRoleOptions(pendingRole)}
                            </select>
                        </td>
                        <td>
                            <button class="primary-btn approve-btn" data-id="${user.id}" style="padding:5px 12px;">Approve</button>
                            <button class="danger-btn reject-btn" data-id="${user.id}" style="padding:5px 12px;">Reject</button>
                        </td>
                    `;
                    pendingBody.appendChild(row);
                }
            }

            // all users table
            usersBody.innerHTML = '';
            for (const user of all) {
                const row = document.createElement('tr');
                const role = String(user.role || (user.is_admin === 1 ? 'admin' : 'user')).toLowerCase();
                const status = user.is_approved === 1 ? 'Approved' : 'Pending';
                // cant delete admin accounts from the UI (safety thing)
                const actions = `<button class="secondary-btn view-batches-btn" data-id="${user.id}" data-email="${escapeHtml(user.email)}" style="padding:5px 12px;">Batches</button> ` +
                    ((role === 'admin' || role === 'manager') && !canAssignAdmin
                        ? ''
                        : `<button class="danger-btn delete-user-btn" data-id="${user.id}" style="padding:5px 12px;">Delete</button>`);
                const roleEditor = user.is_approved === 1
                    ? `<select class="role-select" data-id="${user.id}" style="width:auto; min-width:120px;">${buildRoleOptions(role)}</select>
                       <button class="secondary-btn update-role-btn" data-id="${user.id}" style="padding:5px 10px; margin-left:6px;">Update</button>`
                    : '<span style="color:var(--muted);">Set on approval</span>';
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>${escapeHtml(user.email)}</td>
                    <td>${role.charAt(0).toUpperCase() + role.slice(1)}</td>
                    <td>${status}</td>
                    <td>${actions}</td>
                    <td>${roleEditor}</td>
                `;
                usersBody.appendChild(row);
            }

            // wire up all the buttons
            document.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const userId = parseInt(btn.dataset.id);
                    const roleSelect = document.querySelector(`.pending-role-select[data-id="${userId}"]`);
                    const selectedRole = roleSelect ? roleSelect.value : 'user';
                    const res = await window.adminAPI.approveUser(userId, selectedRole);
                    showMsg(res.success ? 'User approved.' : (res.message || 'Failed.'), res.success);
                    if (res.success) loadUsers();
                });
            });

            document.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!window.confirm('Reject and delete this user?')) return;
                    const res = await window.adminAPI.rejectUser(parseInt(btn.dataset.id));
                    showMsg(res.success ? 'User rejected.' : (res.message || 'Failed.'), res.success);
                    if (res.success) loadUsers();
                });
            });

            document.querySelectorAll('.delete-user-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!window.confirm('Delete this user and all their data?')) return;
                    const res = await window.adminAPI.deleteUser(parseInt(btn.dataset.id));
                    showMsg(res.success ? 'User deleted.' : (res.message || 'Failed.'), res.success);
                    if (res.success) loadUsers();
                });
            });

            // batches buttons - shows a users batch history
            document.querySelectorAll('.view-batches-btn').forEach(btn => {
                btn.addEventListener('click', () => loadUserBatches(parseInt(btn.dataset.id), btn.dataset.email));
            });

            document.querySelectorAll('.update-role-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const userId = parseInt(btn.dataset.id);
                    const roleSelect = document.querySelector(`.role-select[data-id="${userId}"]`);
                    const selectedRole = roleSelect ? roleSelect.value : 'user';
                    const res = await window.adminAPI.updateUserRole(userId, selectedRole);
                    showMsg(res.success ? 'Role updated.' : (res.message || 'Failed to update role.'), res.success);
                    if (res.success) loadUsers();
                });
            });

        } catch (err) {
            console.error('Load users error:', err);
            usersBody.innerHTML = '<tr><td colspan="6">Error loading users.</td></tr>';
        }
    }

    // user batches section - shows when you click Batches on a user
    const batchesSection = document.getElementById('user-batches-section');
    const batchesBody = document.getElementById('user-batches-body');
    const batchesTitle = document.getElementById('user-batches-title');

    document.getElementById('close-user-batches').addEventListener('click', () => {
        batchesSection.style.display = 'none';
    });

    async function loadUserBatches(userId, email) {
        batchesTitle.textContent = `Batches for ${email}`;
        batchesBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
        batchesSection.style.display = 'block';
        batchesSection.scrollIntoView({ behavior: 'smooth' });

        try {
            const res = await window.adminAPI.userBatches(userId);
            if (!res.success || res.batches.length === 0) {
                batchesBody.innerHTML = '<tr><td colspan="4">No batches found for this user.</td></tr>';
                return;
            }
            batchesBody.innerHTML = '';
            for (const batch of res.batches) {
                const row = document.createElement('tr');
                const dateStr = batch.created_at ? new Date(batch.created_at).toLocaleString() : 'N/A';
                row.innerHTML = `
                    <td>${escapeHtml(batch.batch_name || 'Unnamed')}</td>
                    <td>${batch.total_wastage_percent != null ? batch.total_wastage_percent.toFixed(2) + '%' : 'N/A'}</td>
                    <td>${dateStr}</td>
                    <td><button class="secondary-btn view-batch-detail-btn" data-id="${batch.id}" style="padding:5px 12px;">View</button></td>
                `;
                batchesBody.appendChild(row);
            }

            batchesBody.querySelectorAll('.view-batch-detail-btn').forEach(btn => {
                btn.addEventListener('click', () => loadBatchDetail(parseInt(btn.dataset.id)));
            });
        } catch (err) {
            console.error('Load user batches error:', err);
            batchesBody.innerHTML = '<tr><td colspan="4">Error loading batches.</td></tr>';
        }
    }

    // batch detail - shows full CSV when you click View
    const detailSection = document.getElementById('batch-detail-section');

    async function loadBatchDetail(batchId) {
        try {
            const response = await window.adminAPI.batchDetail(batchId);
            if (!response.success) {
                alert(response.message || 'Failed to load details.');
                return;
            }

            const { batch, csvContent } = response;
            detailSection.style.display = 'block';
            detailSection.innerHTML = '';

            // summary stats
            detailSection.insertAdjacentHTML('beforeend', `
                <div class="card">
                    <h3 style="margin-top:0;">${escapeHtml(batch.batch_name || 'Unnamed')}</h3>
                    <div class="stats-row">
                        <div class="stat-card">
                            <p class="stat-value">${batch.total_wastage_percent != null ? batch.total_wastage_percent.toFixed(2) + '%' : 'N/A'}</p>
                            <p class="stat-label">Waste Percentage</p>
                        </div>
                        <div class="stat-card">
                            <p class="stat-value">${batch.created_at ? new Date(batch.created_at).toLocaleDateString() : 'N/A'}</p>
                            <p class="stat-label">Created</p>
                        </div>
                    </div>
                </div>
            `);

            // CSV table
            if (csvContent && csvContent.trim()) {
                detailSection.insertAdjacentHTML('beforeend', buildCsvViewer(csvContent, batch.batch_name || 'batch'));
                const dlBtn = detailSection.querySelector('#btn-download-csv');
                if (dlBtn) {
                    dlBtn.addEventListener('click', () => downloadCsv(csvContent, batch.batch_name || 'batch'));
                }
            } else {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
            }

            // close button
            detailSection.insertAdjacentHTML('beforeend', '<button class="secondary-btn" id="detail-close" style="margin-top:8px;">Close Details</button>');
            document.getElementById('detail-close').addEventListener('click', () => {
                detailSection.style.display = 'none';
            });

            detailSection.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error('Batch detail error:', err);
            alert('Error loading batch details.');
        }
    }

    // builds a scrollable CSV table
    function buildCsvViewer(csvContent, batchName) {
        const lines = csvContent.split('\n').filter(l => l.trim());
        if (lines.length === 0) return '';
        const headers = lines[0].split(',');
        let tableHtml = '<thead><tr>';
        for (const h of headers) tableHtml += `<th>${escapeHtml(h)}</th>`;
        tableHtml += '</tr></thead><tbody>';
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',');
            tableHtml += '<tr>';
            for (const c of cells) tableHtml += `<td>${escapeHtml(c)}</td>`;
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody>';
        return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h3 style="margin:0;">Output CSV</h3><button class="secondary-btn" id="btn-download-csv">Download CSV</button></div><div class="csv-viewer"><table>${tableHtml}</table></div></div>`;
    }

    // CSV download using blob (this page still uses the old method)
    function downloadCsv(csvContent, batchName) {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${batchName.replace(/[^a-zA-Z0-9_-]/g, '_')}_output.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // show a success/error message
    function showMsg(text, success) {
        msg.textContent = text;
        msg.style.color = success ? 'var(--success)' : 'var(--danger)';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    await loadUsers();
});
