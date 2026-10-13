const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const toggleBtn = document.getElementById("toggle-password");
const forgotLink = document.getElementById("forgot-link");
const loginBtn = document.getElementById("login-btn");
const message = document.getElementById("message");

// Show a red (error) or green (success) message under the form
function showMessage(text, isError) {
  message.style.color = isError ? "#e53e3e" : "#7bd88f";
  message.textContent = text;
}

// Already logged in? Go straight to the dashboard
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = "admin.html";
});

// Show / hide password
toggleBtn.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  toggleBtn.textContent = isHidden ? "Hide" : "Show";
});

// Sign in
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("", true);
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  if (error) {
    showMessage("Wrong email or password.", true);
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
    return;
  }

  window.location.href = "admin.html";
});

// Forgot password
forgotLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();

  if (!email) {
    showMessage("Type your email first, then click Forgot password.", true);
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);

  if (error) {
    showMessage("Could not send reset email. Try again later.", true);
  } else {
    showMessage("If that email exists, a reset link has been sent.", false);
  }
});
