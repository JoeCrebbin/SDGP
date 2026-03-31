/*
 * auth.js - Login and Registration Page Handler
 *
 * Handles client-side validation and form submission for both the
 * login page (index.html) and the registration page (register.html).
 *
 * Both pages share this file. The script detects which page it's on
 * by checking which form elements exist (e.g. confirm-password only
 * exists on the register page).
 */

// ---- Client-side Validation ----

// Basic email format check using regex
const validateEmail = (email) => {
  regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(String(email).trim().toLowerCase());
};

// Password strength validation
// Must have: 8+ chars, uppercase, lowercase, number, special character
const validatePassword = (password) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(String(password));
};

// ---- Enter Key Submission ----
// Allows users to press Enter in password fields to submit the form
// (instead of having to click the button)
document.addEventListener('DOMContentLoaded', () => {
    const passwordField = document.getElementById('password');
    const confirmField = document.getElementById('confirm-password');

    if (passwordField && !confirmField) {
        // Login page: Enter on password field submits login
        passwordField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
        });
    }
    if (confirmField) {
        // Register page: Enter on confirm-password field submits registration
        confirmField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleRegister(); }
        });
    }
});

// ---- Login Handler ----

async function handleLogin() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const pass = document.getElementById('password').value;
  const msg = document.getElementById('message');

  // Quick check before making an IPC call
  if (!email || !pass) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter email and password';
    return;
  }

  // Call the login IPC handler in main.js via the preload bridge
  try {
    const response = await window.authAPI.login(email, pass);

    if (response.success) {
      msg.style.color = 'green';
      msg.textContent = 'Login successful!';
      window.location.href = '../html/dashboard.html';
    }
    else {
      msg.style.color = 'red';
      msg.textContent = response.message || 'Email and Password combination incorrect';
    }
  }
  catch (err) {
    console.error('Login Error:', err);
    msg.style.color = 'red';
    msg.textContent = 'An error occurred during login. Please try again';
  }
}

// ---- Registration Handler ----

async function handleRegister() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const msg = document.getElementById('message');

  // Step-by-step validation with user-friendly messages

  if (!email) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter an email';
    return;
  }

  if (!validateEmail(email)) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter a valid email address';
    return;
  }

  if (!password || !confirmPassword) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter and confirm your password';
    return;
  }

  if (password !== confirmPassword) {
    msg.style.color = 'red';
    msg.textContent = 'Passwords do not match';
    return;
  }

  if (!validatePassword(password)) {
    msg.style.color = 'red';
    msg.textContent = 'Password must be at least 8 characters long and include uppercase letters, lowercase letters, and numbers';
    return;
  }

  // All validation passed - call the register IPC handler
  try {
    const response = await window.authAPI.register(email, password);

    if (response.success) {
      msg.style.color = 'green';
      // New users need admin approval before they can log in
      msg.textContent = 'Registration successful! Please wait for an administrator to approve your account';
    }
    else {
      msg.style.color = 'red';
      msg.textContent = response.message || 'Registration failed. Please try again.';
    }
  }
  catch (err) {
    console.error('Registration Error:', err);
    msg.style.color = 'red';
    msg.textContent = 'An error occurred during registration. Please try again';
  }
}
