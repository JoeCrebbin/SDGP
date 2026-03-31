/*
 * auth.js - Login & Registration
 * SDGP 2025/26
 *
 * Handles the login and register forms. Both pages share this file -
 * it checks which elements exist to figure out which page its on.
 * We added client-side validation so users get instant feedback
 * before anything hits the backend.
 */

// basic email format check
const validateEmail = (email) => {
  regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(String(email).trim().toLowerCase());
};

// password needs to be decent - 8+ chars, upper, lower, number, special char
const validatePassword = (password) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(String(password));
};

// let users press Enter to submit instead of having to click the button
document.addEventListener('DOMContentLoaded', () => {
    const passwordField = document.getElementById('password');
    const confirmField = document.getElementById('confirm-password');

    if (passwordField && !confirmField) {
        // login page - Enter submits login
        passwordField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
        });
    }
    if (confirmField) {
        // register page - Enter on confirm field submits registration
        confirmField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleRegister(); }
        });
    }
});

// handle login form submission
async function handleLogin() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const pass = document.getElementById('password').value;
  const msg = document.getElementById('message');

  if (!email || !pass) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter email and password';
    return;
  }

  // call the login handler in main.js via the preload bridge
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

// handle registration form
async function handleRegister() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const locationEl = document.getElementById('location');
  const location = locationEl ? String(locationEl.value || '').trim() : '';
  const msg = document.getElementById('message');

  // validate everything step by step so users know exactly whats wrong

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

  if (!location) {
    msg.style.color = 'red';
    msg.textContent = 'Please select your company location';
    return;
  }

  // all good - send it to the backend
  try {
    const response = await window.authAPI.register(email, password, location);

    if (response.success) {
      msg.style.color = 'green';
      // new users need admin approval before they can log in
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
