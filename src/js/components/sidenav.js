/*
 * sidenav.js - Sidebar Navigation
 * SDGP 2025/26
 *
 * Shared component thats loaded on every page (except login/register).
 * Builds the sidebar with nav links, admin-only links if youre an admin,
 * a high contrast toggle, and the logout button.
 *
 * Also acts as an auth guard - if youre not logged in you get
 * kicked back to the login page. It works really well as a simple
 * way to protect all the pages.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const sidenavContainer = document.getElementById('sidenav-container');
    if (!sidenavContainer) return;

    // check if the user is logged in
    const userStatus = await window.authAPI.checkAuth();

    // not logged in? back to login you go
    if (!userStatus.authenticated) {
        window.location.href = './index.html';
        return;
    }

    // build the sidebar HTML
    let sidenavHTML = `
        <div class="sidenav">
            <h3>Grant Vessels</h3>
            <hr>
            <a href="./dashboard.html">Dashboard</a>
            <a href="./history.html">Batch History</a>
            <a href="./settings.html">My Settings</a>
    `;

    // only show admin stuff if theyre actually an admin
    if (userStatus.isAdmin) {
        sidenavHTML += `
            <p class="sidenav-label">Admin Controls</p>
            <a href="./admin_manage_users.html">User Management</a>
            <a href="./admin_logs.html">System Logs</a>
            <a href="./admin_global_settings.html">Global Settings</a>
            <a href="./admin_active_batches.html">All Batches</a>
        `;
    }

    // bottom section - contrast toggle and logout
    sidenavHTML += `
            <div class="sidenav-spacer"></div>
            <div class="contrast-toggle">
                <label for="contrast-toggle-btn">High Contrast</label>
                <button id="contrast-toggle-btn" role="switch" aria-pressed="false">Off</button>
            </div>
            <hr>
            <a href="#" id="logout-link" style="color: #ff6b6b;">Logout</a>
        </div>
    `;

    sidenavContainer.innerHTML = sidenavHTML;

    // high contrast toggle - saves to localStorage so it sticks between pages
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

    // load saved preference or use OS preference as fallback
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

    // logout - clear session and redirect
    document.getElementById('logout-link').addEventListener('click', async () => {
        await window.authAPI.logout();
        sessionStorage.clear();
        window.location.href = './index.html';
    });
});
