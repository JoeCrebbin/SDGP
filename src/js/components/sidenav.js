/*
 * sidenav.js - Sidebar Navigation Component
 *
 * This is a shared component loaded on every authenticated page.
 * It dynamically builds the sidebar navigation, including:
 *   - Standard links (Dashboard, History, Settings)
 *   - Admin-only links (User Management, Logs, etc.) - only shown if user is admin
 *   - High contrast toggle (saved in localStorage for persistence)
 *   - Logout button
 *
 * It also acts as an auth guard - if the user isn't logged in,
 * they get redirected to the login page.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const sidenavContainer = document.getElementById('sidenav-container');
    if (!sidenavContainer) return;

    // Check if user is authenticated before rendering the page
    const userStatus = await window.authAPI.checkAuth();

    // If not logged in, redirect to the login page
    if (!userStatus.authenticated) {
        window.location.href = './index.html';
        return;
    }

    // Build the sidebar HTML - standard links first
    let sidenavHTML = `
        <div class="sidenav">
            <h3>Grant Vessels</h3>
            <hr>
            <a href="./dashboard.html">Dashboard</a>
            <a href="./history.html">Batch History</a>
            <a href="./settings.html">My Settings</a>
    `;

    // Only show admin controls if the user has admin privileges
    if (userStatus.isAdmin) {
        sidenavHTML += `
            <p class="sidenav-label">Admin Controls</p>
            <a href="./admin_manage_users.html">User Management</a>
            <a href="./admin_logs.html">System Logs</a>
            <a href="./admin_global_settings.html">Global Settings</a>
            <a href="./admin_active_batches.html">All Batches</a>
        `;
    }

    // Bottom section - contrast toggle and logout (pushed down with flex spacer)
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

    // ---- High Contrast Toggle ----
    // Uses localStorage so the setting persists between pages and sessions
    const contrastBtn = document.getElementById('contrast-toggle-btn');
    const STORAGE_KEY = 'highContrast';

    function setHighContrast(enabled){
        // Toggle the CSS class on the root element (switches CSS variables)
        if(enabled) document.documentElement.classList.add('high-contrast');
        else document.documentElement.classList.remove('high-contrast');
        if(contrastBtn){
            contrastBtn.textContent = enabled ? 'On' : 'Off';
            contrastBtn.setAttribute('aria-pressed', enabled);
        }
        try{ localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false'); } catch(e){}
    }

    // Load saved preference on page load, or detect OS preference
    (function initContrast(){
        let stored = null;
        try{ stored = localStorage.getItem(STORAGE_KEY); } catch(e){}
        if(stored === 'true' || stored === 'false'){
            setHighContrast(stored === 'true');
        } else if(window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches){
            // Respect OS-level high contrast preference if no saved setting
            setHighContrast(true);
        } else {
            setHighContrast(false);
        }
    })();

    // Toggle on click
    if(contrastBtn){
        contrastBtn.addEventListener('click', () => {
            const isOn = contrastBtn.getAttribute('aria-pressed') === 'true';
            setHighContrast(!isOn);
        });
    }

    // ---- Logout ----
    // Clears server-side session and redirects to login
    document.getElementById('logout-link').addEventListener('click', async () => {
        await window.authAPI.logout();
        sessionStorage.clear();
        window.location.href = './index.html';
    });
});
