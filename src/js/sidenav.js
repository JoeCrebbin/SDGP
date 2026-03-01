document.addEventListener('DOMContentLoaded', async () => {
    const sidenavContainer = document.getElementById('sidenav-container');
    if (!sidenavContainer) return;

    const userStatus = await window.authAPI.checkAuth();

    if (!userStatus.authenticated) {
        window.location.href = './index.html';
        return;
    }

    // Define the HTML macro
    let sidenavHTML = `
        <div class="sidenav">
            <h3>Grant Vessels</h3>
            <hr>
            <a href="./dashboard.html">Dashboard</a>
            <a href="./history.html">Batch History</a>
            <a href="./settings.html">My Settings</a>
    `;

    // Conditional injection for Admin options
    if (userStatus.isAdmin) {
        sidenavHTML += `
            <p class="sidenav-label">Admin Controls</p>
            <a href="./admin_manage_users.html">User Management</a>
            <a href="./admin_logs.html">System Logs</a>
            <a href="./admin_global_settings.html">Global Settings</a>
            <a href="./admin_active_batches.html">Active Batches</a>
        `;
    }
    else {

    }

    sidenavHTML += `
            <hr>
            <a href="#" id="logout-link" style="color: #ff4d4d;">Logout</a>
        </div>
    `;

    sidenavContainer.innerHTML = sidenavHTML;

    // Handle Logout Logic
    document.getElementById('logout-link').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = './index.html';
    });
});