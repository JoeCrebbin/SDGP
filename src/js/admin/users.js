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
    const currentUserId = Number(authState?.userId || 0);

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

    function requestPasswordConfirmation(actionLabel) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.background = 'rgba(0,0,0,0.45)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999';

            const modal = document.createElement('div');
            modal.style.background = 'var(--bg-secondary, #fff)';
            modal.style.border = '1px solid var(--border, #ddd)';
            modal.style.borderRadius = '10px';
            modal.style.padding = '16px';
            modal.style.width = 'min(92vw, 420px)';
            modal.style.boxShadow = '0 12px 30px rgba(0,0,0,0.2)';

            modal.innerHTML = `
                <h3 style="margin:0 0 8px 0;">Verify Password</h3>
                <p style="margin:0 0 10px 0; color: var(--muted, #666);">Enter your password to ${escapeHtml(actionLabel)}.</p>
                <input id="role-verify-password" type="password" autocomplete="current-password" placeholder="Password" style="width:100%; padding:8px; margin-bottom:12px;" />
                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button type="button" class="secondary-btn" id="role-verify-cancel">Cancel</button>
                    <button type="button" class="primary-btn" id="role-verify-confirm">Confirm</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const input = modal.querySelector('#role-verify-password');
            const cancelBtn = modal.querySelector('#role-verify-cancel');
            const confirmBtn = modal.querySelector('#role-verify-confirm');

            function cleanup(value) {
                document.removeEventListener('keydown', onKeyDown);
                overlay.remove();
                resolve(value);
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') cleanup('');
                if (e.key === 'Enter') cleanup((input.value || '').trim());
            }

            document.addEventListener('keydown', onKeyDown);
            cancelBtn.addEventListener('click', () => cleanup(''));
            confirmBtn.addEventListener('click', () => cleanup((input.value || '').trim()));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup('');
            });

            input.focus();
        });
    }

    // fetch all users and populate both tables - pending approvals and all users
    async function loadUsers() {
        try {
            const response = await window.adminAPI.listUsers();
            if (!response.success) {
                const message = response.message || 'Failed to load users.';
                usersBody.innerHTML = `<tr><td colspan="7">${escapeHtml(message)}</td></tr>`;
                if (message.toLowerCase().includes('unauthorized')) {
                    msg.textContent = 'Admin access required. Please log in as an admin.';
                    msg.style.color = 'var(--danger)';
                }
                return;
            }

            const pending = response.users.filter(u => u.is_approved === 0);
            const all = response.users;

            if (allUsersTitle) {
                allUsersTitle.textContent = `All Users (${all.length})`;
            }

            // pending approvals table
            if (pending.length === 0) {
                pendingBody.innerHTML = '<tr><td colspan="4">No pending approvals.</td></tr>';
            } else {
                pendingBody.innerHTML = '';
                for (const user of pending) {
                    const row = document.createElement('tr');
                    const pendingRole = String(user.role || 'user').toLowerCase();
                    const location = escapeHtml(user.location || 'Unknown');
                    row.innerHTML = `
                        <td>${escapeHtml(user.email)}</td>
                        <td>${location}</td>
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
                const isSelf = currentUserId > 0 && Number(user.id) === currentUserId;
                const location = escapeHtml(user.location || 'Unknown');
                const role = String(user.role || (user.is_admin === 1 ? 'admin' : 'user')).toLowerCase();
                const status = user.is_approved === 1 ? 'Approved' : 'Pending';
                // cant delete admin accounts from the UI (safety thing)
                const actions = `<button class="secondary-btn view-batches-btn" data-id="${user.id}" data-email="${escapeHtml(user.email)}" style="padding:5px 12px;">Batches</button> ` +
                    ((role === 'admin' || role === 'manager') && !canAssignAdmin
                        ? ''
                        : `<button class="danger-btn delete-user-btn" data-id="${user.id}" style="padding:5px 12px;">Delete</button>`);
                const roleEditor = user.is_approved === 1
                    ? (isSelf
                        ? '<span style="color:var(--muted);">You cannot change your own role</span>'
                        : `<select class="role-select" data-id="${user.id}" style="width:auto; min-width:120px;">${buildRoleOptions(role)}</select>
                       <button class="secondary-btn update-role-btn" data-id="${user.id}" style="padding:5px 10px; margin-left:6px;">Update</button>`)
                    : '<span style="color:var(--muted);">Set on approval</span>';
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>${escapeHtml(user.email)}</td>
                    <td>${location}</td>
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
                    const actingPassword = await requestPasswordConfirmation('approve this user and assign role');
                    if (!actingPassword) {
                        showMsg('Role approval cancelled: password confirmation required.', false);
                        return;
                    }
                    const res = await window.adminAPI.approveUser(userId, selectedRole, actingPassword);
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
                    const actingPassword = await requestPasswordConfirmation('change this user role');
                    if (!actingPassword) {
                        showMsg('Role change cancelled: password confirmation required.', false);
                        return;
                    }
                    const res = await window.adminAPI.updateUserRole(userId, selectedRole, actingPassword);
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

            if (csvContent && csvContent.trim()) {
                const parsed = window.batchDetailHelpers.parseSavedCsv(csvContent);
                const safeBatchName = batch.batch_name || 'Unnamed';

                // standard card layout - result summary
                detailSection.insertAdjacentHTML('beforeend', `
                    <div class="stats-row">
                        <div class="stat-card">
                            <p class="stat-value">${parsed.totalBeams}</p>
                            <p class="stat-label">Beams Used</p>
                        </div>
                        <div class="stat-card">
                            <p class="stat-value">${parsed.totalStockMm.toLocaleString()} mm</p>
                            <p class="stat-label">Total Stock</p>
                        </div>
                        <div class="stat-card">
                            <p class="stat-value">${parsed.totalCutMm.toLocaleString()} mm</p>
                            <p class="stat-label">Material Cut</p>
                        </div>
                        <div class="stat-card">
                            <p class="stat-value">${parsed.totalWasteMm.toLocaleString()} mm</p>
                            <p class="stat-label">Total Waste</p>
                        </div>
                        <div class="stat-card">
                            <p class="stat-value">${parsed.wastePct.toFixed(2)}%</p>
                            <p class="stat-label">Waste Percentage</p>
                        </div>
                    </div>
                `);

                // Cutting layout and CSV table
                detailSection.insertAdjacentHTML('beforeend', window.batchDetailHelpers.buildBeamLayout(parsed.beams, safeBatchName));
                const dlLayoutBtn = document.getElementById('btn-download-layout');
                if (dlLayoutBtn) dlLayoutBtn.addEventListener('click', () => window.batchDetailHelpers.downloadLayoutAsPdf(safeBatchName));

                detailSection.insertAdjacentHTML('beforeend', window.batchDetailHelpers.buildCsvViewer(csvContent, safeBatchName));

                const dlBtn = detailSection.querySelector('#btn-download-csv');
                if (dlBtn) {
                    dlBtn.addEventListener('click', () => downloadCsv(csvContent, batch.batch_name || 'batch'));
                }

                // Charts for waste comparison and utilisation
                const chartData = parseChartData(csvContent, parsed);
                detailSection.insertAdjacentHTML('beforeend', `
                    <div class="card">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <h3 style="margin:0;">Waste Comparison</h3>
                            <button class="secondary-btn" id="btn-dl-chart-bar">Download Chart</button>
                        </div>
                        <div class="chart-container" style="height:360px;"><canvas id="chart-bar"></canvas></div>
                    </div>
                    <div class="card">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <h3 style="margin:0;">Material Utilisation</h3>
                            <button class="secondary-btn" id="btn-dl-chart-pie">Download Chart</button>
                        </div>
                        <div class="chart-container" style="height:360px;"><canvas id="chart-pie"></canvas></div>
                    </div>
                `);

                buildSingleChart(chartData, 'chart-bar', 'overview-bar');
                buildSingleChart(chartData, 'chart-pie', 'overview-pie');

                document.getElementById('btn-dl-chart-bar').addEventListener('click', () => downloadChartAsPng('chart-bar', `${safeBatchName}_waste_comparison.png`));
                document.getElementById('btn-dl-chart-pie').addEventListener('click', () => downloadChartAsPng('chart-pie', `${safeBatchName}_utilisation_pie.png`));

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

    // Charts helper: rebuild from saved batch data
    function parseChartData(csvContent, parsed) {
        const data = {
            optimisedWasteMm: parsed.totalWasteMm,
            totalStockMm: parsed.totalStockMm,
            totalWasteMm: parsed.totalWasteMm,
            totalCutMm: parsed.totalCutMm,
            oldWasteMm: null
        };

        const lines = csvContent.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
            const headers = lines[0].split(',');
            const oldWasteIdx = headers.indexOf('OldWaste_mm');
            const beamIndexIdx = headers.indexOf('BeamIndex');

            if (oldWasteIdx >= 0) {
                let totalOldWaste = 0;
                let hasAnyOld = false;
                const oldWastePerBeam = {};

                for (let i = 1; i < lines.length; i++) {
                    const cells = lines[i].split(',');
                    const bi = cells[beamIndexIdx];
                    const oldW = parseFloat(cells[oldWasteIdx]) || 0;
                    if (oldW > 0) {
                        hasAnyOld = true;
                        if (!(bi in oldWastePerBeam) || oldW > oldWastePerBeam[bi]) {
                            oldWastePerBeam[bi] = oldW;
                        }
                    }
                }

                if (hasAnyOld) {
                    for (const v of Object.values(oldWastePerBeam)) totalOldWaste += v;
                    data.oldWasteMm = totalOldWaste;
                }
            }
        }

        return data;
    }

    const pieDataLabelsPlugin = {
        id: 'pieDataLabels',
        afterDraw(chart) {
            const { ctx } = chart;
            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);
            const total = dataset.data.reduce((a, b) => a + b, 0);
            if (total === 0) return;
            ctx.save();
            ctx.font = 'bold 12px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            meta.data.forEach((element, i) => {
                const pct = ((dataset.data[i] / total) * 100).toFixed(1);
                const midAngle = (element.startAngle + element.endAngle) / 2;
                const outerRadius = element.outerRadius;
                const x = element.x + Math.cos(midAngle) * (outerRadius + 20);
                const y = element.y + Math.sin(midAngle) * (outerRadius + 20);
                ctx.fillStyle = '#111';
                ctx.fillText(`${pct}%`, x, y);
            });
            ctx.restore();
        }
    };

    function buildSingleChart(chartData, canvasId, chartType) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        let config;

        if (chartType === 'overview-bar') {
            const labels = ['Waste (mm)'];
            const datasets = [{
                label: 'Optimised Waste',
                data: [chartData.optimisedWasteMm],
                backgroundColor: 'rgba(0, 120, 212, 0.75)',
                borderColor: 'rgba(0, 120, 212, 1)',
                borderWidth: 1,
                barPercentage: 0.5
            }];
            if (chartData.oldWasteMm !== null) {
                datasets.push({
                    label: 'Previous Waste',
                    data: [chartData.oldWasteMm],
                    backgroundColor: 'rgba(220, 38, 38, 0.6)',
                    borderColor: 'rgba(220, 38, 38, 1)',
                    borderWidth: 1,
                    barPercentage: 0.5
                });
            }
            config = {
                type: 'bar',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        title: { display: true, text: 'Waste Comparison' }
                    },
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'mm' } } }
                }
            };
        } else if (chartType === 'overview-pie') {
            const total = chartData.totalCutMm + chartData.totalWasteMm;
            const usedPct = total > 0 ? ((chartData.totalCutMm / total) * 100).toFixed(1) : '0';
            const wastePct = total > 0 ? ((chartData.totalWasteMm / total) * 100).toFixed(1) : '0';
            config = {
                type: 'pie',
                data: {
                    labels: [`Material Used (${usedPct}%)`, `Waste (${wastePct}%)`],
                    datasets: [{
                        data: [chartData.totalCutMm, chartData.totalWasteMm],
                        backgroundColor: ['rgba(0, 120, 212, 0.75)', 'rgba(220, 38, 38, 0.6)'],
                        borderColor: ['rgba(0, 120, 212, 1)', 'rgba(220, 38, 38, 1)'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' },
                        title: { display: true, text: 'Material Utilisation' },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const t = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                    return `${ctx.label}: ${formatMm(ctx.raw)} (${((ctx.raw / t) * 100).toFixed(1)}%)`;
                                }
                            }
                        }
                    }
                },
                plugins: [pieDataLabelsPlugin]
            };
        }

        if (config) new Chart(canvas.getContext('2d'), config);
    }

    function formatMm(mm) {
        return `${Number(mm).toFixed(0)} mm`;
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
