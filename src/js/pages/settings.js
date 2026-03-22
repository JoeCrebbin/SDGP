/*
 * settings.js - User Settings Page Handler
 *
 * Manages two features:
 *   1. Password change - requires current password verification
 *   2. Account deletion - requires password confirmation + modal warning
 *
 * Both operations go through the userAPI exposed via the preload bridge.
 */

document.addEventListener('DOMContentLoaded', () => {
    const btnChangePassword = document.getElementById('btn-change-password');
    const btnDeleteAccount = document.getElementById('btn-delete-account');
    const passwordMsg = document.getElementById('password-message');
    const deleteMsg = document.getElementById('delete-message');

    // Password strength validation (same rules as registration)
    // Must have: 8+ chars, uppercase, lowercase, number, special character
    function validatePassword(password) {
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return regex.test(password);
    }

    // ---- Change Password ----
    btnChangePassword.addEventListener('click', async () => {
        const currentPass = document.getElementById('current-password').value;
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-password').value;

        passwordMsg.textContent = '';

        // Client-side validation before hitting the backend
        if (!currentPass || !newPass || !confirmPass) {
            passwordMsg.style.color = 'var(--danger)';
            passwordMsg.textContent = 'Please fill in all password fields.';
            return;
        }

        if (newPass !== confirmPass) {
            passwordMsg.style.color = 'var(--danger)';
            passwordMsg.textContent = 'New passwords do not match.';
            return;
        }

        if (!validatePassword(newPass)) {
            passwordMsg.style.color = 'var(--danger)';
            passwordMsg.textContent = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character (@$!%*?&).';
            return;
        }

        // Show loading state
        btnChangePassword.disabled = true;
        passwordMsg.style.color = '';
        passwordMsg.textContent = 'Changing password...';

        try {
            const response = await window.userAPI.changePassword(currentPass, newPass);
            if (response.success) {
                passwordMsg.style.color = 'var(--success)';
                passwordMsg.textContent = 'Password changed successfully.';
                // Clear the form fields on success
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            } else {
                passwordMsg.style.color = 'var(--danger)';
                passwordMsg.textContent = response.message || 'Failed to change password.';
            }
        } catch (err) {
            console.error('Change password error:', err);
            passwordMsg.style.color = 'var(--danger)';
            passwordMsg.textContent = 'An error occurred. Please try again.';
        } finally {
            btnChangePassword.disabled = false;
        }
    });

    // ---- Delete Account ----
    btnDeleteAccount.addEventListener('click', async () => {
        const password = document.getElementById('delete-password').value;

        deleteMsg.textContent = '';

        if (!password) {
            deleteMsg.style.color = 'var(--danger)';
            deleteMsg.textContent = 'Please enter your password to confirm.';
            return;
        }

        // Show a native confirmation dialog before proceeding
        // Note: we use window.confirm explicitly to avoid shadowing the built-in
        const userConfirmed = window.confirm('Are you sure you want to delete your account? This cannot be undone.');
        if (!userConfirmed) return;

        btnDeleteAccount.disabled = true;
        deleteMsg.style.color = '';
        deleteMsg.textContent = 'Deleting account...';

        try {
            const response = await window.userAPI.deleteAccount(password);
            if (response.success) {
                // Account deleted - redirect to login page
                sessionStorage.clear();
                window.location.href = './index.html';
            } else {
                deleteMsg.style.color = 'var(--danger)';
                deleteMsg.textContent = response.message || 'Failed to delete account.';
            }
        } catch (err) {
            console.error('Delete account error:', err);
            deleteMsg.style.color = 'var(--danger)';
            deleteMsg.textContent = 'An error occurred. Please try again.';
        } finally {
            btnDeleteAccount.disabled = false;
        }
    });
});
