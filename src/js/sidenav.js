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
            <div class="contrast-toggle">
                <label for="contrast-toggle-btn">High Contrast</label>
                <button id="contrast-toggle-btn" role="switch" aria-pressed="false">Off</button>
            </div>
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

    // Initialize contrast toggle state and handlers
    const contrastBtn = document.getElementById('contrast-toggle-btn');
    const STORAGE_KEY = 'highContrast';

    function setHighContrast(enabled){
        if(enabled) document.documentElement.classList.add('high-contrast');
        else document.documentElement.classList.remove('high-contrast');
        if(contrastBtn){
            contrastBtn.textContent = enabled ? 'On' : 'Off';
            contrastBtn.setAttribute('aria-pressed', enabled);
        }
        try{ localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false'); } catch(e){}
    }

    // Determine initial state: stored preference -> prefers-contrast -> default off
    (function initContrast(){
        let stored = null;
        try{ stored = localStorage.getItem(STORAGE_KEY); } catch(e){}
        if(stored === 'true' || stored === 'false'){
            setHighContrast(stored === 'true');
        } else if(window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches){
            setHighContrast(true);
        } else {
            setHighContrast(false);
        }
    })();

    if(contrastBtn){
        contrastBtn.addEventListener('click', () => {
            const isOn = contrastBtn.getAttribute('aria-pressed') === 'true';
            setHighContrast(!isOn);
        });
    }

    // Handle Logout Logic
    document.getElementById('logout-link').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = './index.html';
    });
});