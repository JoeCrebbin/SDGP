// Client-side validation functions

// Email format validation
const validateEmail = (email) => {
  regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(String(email).trim().toLowerCase());
};

// Password strength validation
const validatePassword = (password) => {
  // Password must be at least 8 characters, contain at least one uppercase letter, one lowercase letter, one number, and one special character
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(String(password));
};

// Form submission handlers

// Handle login logic
async function handleLogin() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const pass = document.getElementById('password').value;
  const msg = document.getElementById('message');

  // Basic client-side validation
  if (!email || !pass) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter email and password';
    return;
  }

  // Call the login function exposed in the main process via the preload script
  try {
    const response = await window.authAPI.login(email, pass);

    if (response.success) {
      msg.style.color = 'green';
      msg.textContent = 'Login successful!';

      window.location.href = '../html/dashboard.html'; // Redirect to dashboard
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

// Handle registration logic
async function handleRegister() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const msg = document.getElementById('message');

  // Client-side validation
  
  // Check if email is provided
  if (!email) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter an email';
    return;
  }

  // Validate email format
  if (!validateEmail(email)) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter a valid email address';
    return;
  }

  // Check if password and confirm password are provided
  if (!password || !confirmPassword) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter and confirm your password';
    return;
  }

  // Check if passwords match
  if (password !== confirmPassword) {
    msg.style.color = 'red';
    msg.textContent = 'Passwords do not match';
    return;
  }

  // Validate password strength
  if (!validatePassword(password)) {
    msg.style.color = 'red';
    msg.textContent = 'Password must be at least 8 characters long and include uppercase letters, lowercase letters, and numbers';
    return;
  }

  // Call the register function exposed in the main process via the preload script
  try {
    const response = await window.authAPI.register(email, password); // Call the IPC handler in main.js

    if (response.success) {
      msg.style.color = 'green';
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