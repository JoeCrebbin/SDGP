async function handleLogin() {
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;
  const msg = document.getElementById('message');

  // Basic client-side validation
  if (!user || !pass) {
    msg.style.color = 'red';
    msg.textContent = 'Please enter both username and password';
    return;
  }

  // Call the login function exposed in the main process via the preload script
  try {
    const response = await window.authAPI.login(user, pass);

    if (response.success) {
      msg.style.color = 'green';
      msg.textContent = 'Login successful!';
      
      if (response.isAdmin) {
        window.location.href = '../html/admin_dash.html'; // Redirect to admin dashboard
      }
      else {
        window.location.href = '../html/user_dash.html'; // Redirect to user dashboard
      }
    } 
    else {
      msg.style.color = 'red';
      msg.textContent = response.message || 'Username and Password combination incorrect';
    }
  }
  catch (err) {
    console.error('Login Error:', err);
    msg.style.color = 'red';
    msg.textContent = 'An error occurred during login. Please try again';
  }
}