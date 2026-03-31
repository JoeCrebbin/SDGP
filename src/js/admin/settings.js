/*
 * admin/settings.js - Global Settings Page (Admin)
 * SDGP 2025/26
 *
 * Lets the admin set app-wide defaults like kerf width and min remnant.
 * These get loaded on the dashboard automatically so users dont have
 * to enter them every time. Pretty simple page really.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const kerfInput = document.getElementById('setting-kerf');
    const remnantInput = document.getElementById('setting-remnant');
    const maxBeamsInput = document.getElementById('setting-max-beams');
    const saveBtn = document.getElementById('save-settings-btn');
    const msg = document.getElementById('settings-message');

    // load the current values from the database
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

    // save when the button is clicked
    saveBtn.addEventListener('click', async () => {
        const settings = {
            default_kerf_mm: kerfInput.value,
            default_min_remnant_mm: remnantInput.value,
            max_beams_display: maxBeamsInput.value
        };

        // validation - remnant cant be smaller than the kerf (makes no physical sense)
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
