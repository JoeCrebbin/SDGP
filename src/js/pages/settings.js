/*
 * settings.js - User Settings Page
 * SDGP 2025/26
 *
 * Pretty straightforward - lets users change their password or
 * delete their account. The delete has a confirmation modal because
 * we dont want anyone accidentally nuking their data.
 */

document.addEventListener('DOMContentLoaded', () => {
    const btnChangePassword = document.getElementById('btn-change-password');
    const btnDeleteAccount = document.getElementById('btn-delete-account');
    const passwordMsg = document.getElementById('password-message');
    const deleteMsg = document.getElementById('delete-message');

    // same password rules as registration
    function validatePassword(password) {
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return regex.test(password);
    }

    // change password - need to verify the current one first
    btnChangePassword.addEventListener('click', async () => {
        const currentPass = document.getElementById('current-password').value;
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-password').value;

        passwordMsg.textContent = '';

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

        btnChangePassword.disabled = true;
        passwordMsg.style.color = '';
        passwordMsg.textContent = 'Changing password...';

        try {
            const response = await window.userAPI.changePassword(currentPass, newPass);
            if (response.success) {
                passwordMsg.style.color = 'var(--success)';
                passwordMsg.textContent = 'Password changed successfully.';
                // clear the form
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

    // delete account - scary button, needs password confirmation and a dialog
    btnDeleteAccount.addEventListener('click', async () => {
        const password = document.getElementById('delete-password').value;

        deleteMsg.textContent = '';

        if (!password) {
            deleteMsg.style.color = 'var(--danger)';
            deleteMsg.textContent = 'Please enter your password to confirm.';
            return;
        }

        // make absolutely sure they want to do this
        const userConfirmed = window.confirm('Are you sure you want to delete your account? This cannot be undone.');
        if (!userConfirmed) return;

        btnDeleteAccount.disabled = true;
        deleteMsg.style.color = '';
        deleteMsg.textContent = 'Deleting account...';

        try {
            const response = await window.userAPI.deleteAccount(password);
            if (response.success) {
                // gone - redirect to login
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
