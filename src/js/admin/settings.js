/*
 * admin/settings.js - Global Settings Page Handler (Admin Only)
 *
 * Manages application-wide default values that are stored in the
 * global_settings table as key-value pairs. Currently supports:
 *   - default_kerf_mm: Default saw blade width (used on dashboard)
 *   - default_min_remnant_mm: Minimum remnant length before discarding
 *   - max_beams_display: How many beams to show in the cutting layout
 *
 * These values are loaded by the dashboard on page load so users
 * get consistent defaults without having to set them each time.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const kerfInput = document.getElementById('setting-kerf');
    const remnantInput = document.getElementById('setting-remnant');
    const maxBeamsInput = document.getElementById('setting-max-beams');
    const saveBtn = document.getElementById('save-settings-btn');
    const msg = document.getElementById('settings-message');

    // Load current settings values from the database
    try {
        const response = await window.adminAPI.getSettings();
        if (response.success) {
            kerfInput.value = response.settings.default_kerf_mm || '3.0';
            remnantInput.value = response.settings.default_min_remnant_mm || '500';
            maxBeamsInput.value = response.settings.max_beams_display || '50';
        }
    } catch (err) {
        console.error('Load settings error:', err);
    }

    // Save updated settings when the button is clicked
    saveBtn.addEventListener('click', async () => {
        // Collect all settings into an object
        const settings = {
            default_kerf_mm: kerfInput.value,
            default_min_remnant_mm: remnantInput.value,
            max_beams_display: maxBeamsInput.value
        };

        // Validate: min remnant must be at least the kerf width
        const kerf = parseFloat(settings.default_kerf_mm) || 0;
        const remnant = parseFloat(settings.default_min_remnant_mm) || 0;
        if (remnant < kerf) {
            msg.textContent = `Minimum reusable length (${remnant}mm) cannot be shorter than the saw blade width (${kerf}mm).`;
            msg.style.color = 'var(--danger)';
            return;
        }

        saveBtn.disabled = true;
        msg.textContent = 'Saving...';
        msg.style.color = '';

        try {
            // Backend uses INSERT OR REPLACE to upsert each key-value pair
            const response = await window.adminAPI.updateSettings(settings);
            if (response.success) {
                msg.textContent = 'Settings saved successfully.';
                msg.style.color = 'var(--success)';
            } else {
                msg.textContent = response.message || 'Failed to save settings.';
                msg.style.color = 'var(--danger)';
            }
        } catch (err) {
            console.error('Save settings error:', err);
            msg.textContent = 'Error saving settings.';
            msg.style.color = 'var(--danger)';
        } finally {
            saveBtn.disabled = false;
        }
    });
});
