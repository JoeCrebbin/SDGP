/*
 * admin/users.js - User Management Page Handler (Admin Only)
 *
 * Provides admin functionality for managing users:
 *   - View pending registrations and approve/reject them
 *   - View all registered users with their role and status
 *   - Delete non-admin users (cascade-deletes their data)
 *   - View a specific user's batch history
 *
 * All operations go through adminAPI which checks admin privileges on the backend.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const pendingBody = document.getElementById('pending-body');
    const usersBody = document.getElementById('users-body');
    const msg = document.getElementById('admin-message');

    /**
     * Fetch all users from the backend and render both tables:
     *   - Pending approvals table (users with is_approved = 0)
     *   - All users table (everyone)
     */
    async function loadUsers() {
        try {
            const response = await window.adminAPI.listUsers();
            if (!response.success) {
                usersBody.innerHTML = '<tr><td colspan="5">Failed to load users.</td></tr>';
                return;
            }

            // Split users into pending and all
            const pending = response.users.filter(u => u.is_approved === 0);
            const all = response.users;

            // Render pending approvals section
            if (pending.length === 0) {
                pendingBody.innerHTML = '<tr><td colspan="2">No pending approvals.</td></tr>';
            } else {
                pendingBody.innerHTML = '';
                for (const user of pending) {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${escapeHtml(user.email)}</td>
                        <td>
                            <button class="primary-btn approve-btn" data-id="${user.id}" style="padding:5px 12px;">Approve</button>
                            <button class="danger-btn reject-btn" data-id="${user.id}" style="padding:5px 12px;">Reject</button>
                        </td>
                    `;
                    pendingBody.appendChild(row);
                }
            }

            // Render all users table
            usersBody.innerHTML = '';
            for (const user of all) {
                const row = document.createElement('tr');
                const role = user.is_admin === 1 ? 'Admin' : 'User';
                const status = user.is_approved === 1 ? 'Approved' : 'Pending';
                // Admin users can't be deleted through the UI (safety measure)
                const actions = `<button class="secondary-btn view-batches-btn" data-id="${user.id}" data-email="${escapeHtml(user.email)}" style="padding:5px 12px;">Batches</button> ` +
                    (user.is_admin === 1 ? '' : `<button class="danger-btn delete-user-btn" data-id="${user.id}" style="padding:5px 12px;">Delete</button>`);
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>${escapeHtml(user.email)}</td>
                    <td>${role}</td>
                    <td>${status}</td>
                    <td>${actions}</td>
                `;
                usersBody.appendChild(row);
            }

            // Wire up all the action buttons
            document.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const res = await window.adminAPI.approveUser(parseInt(btn.dataset.id));
                    showMsg(res.success ? 'User approved.' : (res.message || 'Failed.'), res.success);
                    if (res.success) loadUsers(); // Refresh the table
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

            // Wire up "Batches" buttons to show a user's batch history
            document.querySelectorAll('.view-batches-btn').forEach(btn => {
                btn.addEventListener('click', () => loadUserBatches(parseInt(btn.dataset.id), btn.dataset.email));
            });

        } catch (err) {
            console.error('Load users error:', err);
            usersBody.innerHTML = '<tr><td colspan="5">Error loading users.</td></tr>';
        }
    }

    // ---- User Batches Section ----
    // Shows when admin clicks "Batches" on a specific user
    const batchesSection = document.getElementById('user-batches-section');
    const batchesBody = document.getElementById('user-batches-body');
    const batchesTitle = document.getElementById('user-batches-title');

    document.getElementById('close-user-batches').addEventListener('click', () => {
        batchesSection.style.display = 'none';
    });

    // Load and display all batches belonging to a specific user
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

            // Wire up View buttons to show batch detail
            batchesBody.querySelectorAll('.view-batch-detail-btn').forEach(btn => {
                btn.addEventListener('click', () => loadBatchDetail(parseInt(btn.dataset.id)));
            });
        } catch (err) {
            console.error('Load user batches error:', err);
            batchesBody.innerHTML = '<tr><td colspan="4">Error loading batches.</td></tr>';
        }
    }

    // ---- Batch Detail Section ----
    // Shows full CSV data when admin clicks "View" on a batch
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

            // Summary stats
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

            // CSV viewer
            if (csvContent && csvContent.trim()) {
                detailSection.insertAdjacentHTML('beforeend', buildCsvViewer(csvContent, batch.batch_name || 'batch'));
                const dlBtn = detailSection.querySelector('#btn-download-csv');
                if (dlBtn) {
                    dlBtn.addEventListener('click', () => downloadCsv(csvContent, batch.batch_name || 'batch'));
                }
            } else {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
            }

            // Close button
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

    // Build a scrollable CSV data table
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

    // Trigger CSV file download
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

    // Display a success/error message to the admin
    function showMsg(text, success) {
        msg.textContent = text;
        msg.style.color = success ? 'var(--success)' : 'var(--danger)';
    }

    // XSS prevention
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    // Load users on page load
    await loadUsers();
});
