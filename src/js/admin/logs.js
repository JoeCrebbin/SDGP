/*
 * admin/logs.js - System Logs Page Handler (Admin Only)
 *
 * Displays a searchable table of activity logs. Every significant action
 * (login, optimisation, user approval, settings change, etc.) is logged
 * by the logActivity() function in main.js.
 *
 * Logs are stored in the activity_logs table with timestamp, user email,
 * action type, and detail text.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const logsBody = document.getElementById('logs-body');
    const searchInput = document.getElementById('log-search');
    const searchBtn = document.getElementById('log-search-btn');

    /**
     * Fetch and display activity logs.
     * Optional search parameter filters by email, action, or detail text.
     */
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

            // Build a table row for each log entry
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

    // Load all logs on page load
    await loadLogs();

    // Search functionality - button click and Enter key
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
