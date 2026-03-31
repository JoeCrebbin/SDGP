/*
 * admin/logs.js - System Logs Page (Admin)
 * SDGP 2025/26
 *
 * Shows a searchable table of everything thats happened in the app.
 * Logins, optimisations, user approvals, settings changes etc all
 * get logged by main.js and we just display them here.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const logsBody = document.getElementById('logs-body');
    const searchInput = document.getElementById('log-search');
    const searchBtn = document.getElementById('log-search-btn');

    // fetch and display the logs, with optional search filter
    async function loadLogs(search) {
        try {
            const response = await window.adminAPI.listLogs(search || '', 200);
            if (!response.success) {
                logsBody.innerHTML = '<tr><td colspan="4">Failed to load logs.</td></tr>';
                return;
            }

            if (response.logs.length === 0) {
                logsBody.innerHTML = '<tr><td colspan="4">No activity logs found.</td></tr>';
                return;
            }

            logsBody.innerHTML = '';
            for (const log of response.logs) {
                const row = document.createElement('tr');
                const dateStr = log.created_at
                    ? new Date(log.created_at).toLocaleString()
                    : 'N/A';
                row.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${escapeHtml(log.user_email || 'unknown')}</td>
                    <td>${escapeHtml(log.action || '')}</td>
                    <td>${escapeHtml(log.detail || '')}</td>
                `;
                logsBody.appendChild(row);
            }
        } catch (err) {
            console.error('Load logs error:', err);
            logsBody.innerHTML = '<tr><td colspan="4">Error loading logs.</td></tr>';
        }
    }

    await loadLogs();

    // search by clicking or pressing Enter
    searchBtn.addEventListener('click', () => loadLogs(searchInput.value.trim()));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadLogs(searchInput.value.trim());
    });

    // XSS prevention
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
});
