import { showMessage, bindToggleButtons } from "./auth-common.js";

const storedUser = JSON.parse(localStorage.getItem("nirapodUser") || "null");
if (storedUser?.id) {
  window.location.href = "/dashboard.html";
}

const API_BASE_URL = `${window.location.origin}/api`;
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

async function loginUser(identifier, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Login failed.");
  }

  return data;
}

function bindLoginForm() {
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const identifier = formData.get("identifier")?.toString().trim().toLowerCase();
    const password = formData.get("password")?.toString().trim();

    try {
      const data = await loginUser(identifier, password);
      const { user } = data;
      if (user) {
        const safeUser = { ...user };
        delete safeUser.password;
        localStorage.setItem("nirapodUser", JSON.stringify(safeUser));
        // store a lightweight session record for synchronization
        const session = { id: safeUser.id || safeUser._id, loginAt: new Date().toISOString() };
        localStorage.setItem("nirapodSession", JSON.stringify(session));
      }
      showMessage(loginMessage, "success", `Welcome back, ${data.user.fullName || data.user.username}! Redirecting...`);
      setTimeout(() => {
        window.location.href = "/dashboard.html";
      }, 600);
    } catch (error) {
      showMessage(loginMessage, "error", error.message || "Login failed.");
    }
  });
}

bindToggleButtons();
bindLoginForm();
