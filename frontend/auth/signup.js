import { showMessage, bindToggleButtons, switchAuthTab } from "./auth-common.js";

const storedUser = JSON.parse(localStorage.getItem("nirapodUser") || "null");
if (storedUser?.id) {
  window.location.href = "/dashboard.html";
}

const API_BASE_URL = `${window.location.origin}/api`;
const MAX_PROFILE_IMAGE_SIZE = 3 * 1024 * 1024; // 3 MB
const PHONE_REGEX = /^01\d{9}$/;
const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
const signupForm = document.getElementById("signupForm");
const signupMessage = document.getElementById("signupMessage");
const profileInput = document.getElementById("profilePicture");
const profilePreview = document.getElementById("profilePreview");
const profilePreviewContainer = document.getElementById("avatarPreviewContainer");
const removeProfileBtn = document.getElementById("removeProfilePic");
const profileUploadBtn = document.getElementById("profileUploadBtn");
const profileFilename = document.getElementById("profileFilename");

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isValidPhone(phone) {
  return PHONE_REGEX.test(phone);
}

function isValidGmail(email) {
  return GMAIL_REGEX.test(email);
}

function resetForm(form) {
  clearSignupErrors();
  form.reset();
  updateProfilePreview(false);
}

function clearSignupErrors() {
  signupForm.classList.remove("error");
  signupForm.querySelectorAll(".invalid").forEach((element) => {
    element.classList.remove("invalid");
  });
}

function markFieldInvalid(element) {
  const label = element.closest("label");
  if (label) {
    label.classList.add("invalid");
  }
  signupForm.classList.add("error");
}

function updateProfilePreview(hasImage) {
  if (hasImage) {
    profilePreview.classList.add("show");
    profilePreviewContainer.classList.add("has-image");
    removeProfileBtn?.classList.add("visible");
  } else {
    profilePreview.classList.remove("show");
    profilePreview.src = "";
    profilePreviewContainer.classList.remove("has-image");
    removeProfileBtn?.classList.remove("visible");
  }
}

function bindProfileUpload() {
  profileInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      profileFilename.textContent = "No file chosen";
      updateProfilePreview(false);
      return;
    }

    profileFilename.textContent = file.name;

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      clearSignupErrors();
      signupForm.classList.add("error");
      showMessage(
        signupMessage,
        "error",
        `Profile picture must be smaller than ${formatBytes(MAX_PROFILE_IMAGE_SIZE)}.`
      );
      profileInput.value = "";
      profileFilename.textContent = "No file chosen";
      updateProfilePreview(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      profilePreview.src = reader.result;
      updateProfilePreview(true);
    };
    reader.readAsDataURL(file);
  });

  removeProfileBtn?.addEventListener("click", () => {
    profileInput.value = "";
    profileFilename.textContent = "No file chosen";
    updateProfilePreview(false);
  });

  profileUploadBtn?.addEventListener("click", () => {
    profileInput?.click();
  });

  profilePreviewContainer?.addEventListener("click", () => {
    profileInput?.click();
  });
}

function validateSignupForm() {
  clearSignupErrors();

  if (!signupForm.checkValidity()) {
    const invalidField = signupForm.querySelector(":invalid");
    if (invalidField) {
      markFieldInvalid(invalidField);
    }
    showMessage(signupMessage, "error", "Please complete all required fields.");
    return false;
  }

  const formData = new FormData(signupForm);
  const email = formData.get("email")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const username = formData.get("username")?.toString().trim().toLowerCase();

  if (!isValidGmail(email)) {
    const emailField = signupForm.querySelector('input[name="email"]');
    if (emailField) markFieldInvalid(emailField);
    showMessage(signupMessage, "error", "Email must be a valid Gmail address ending with @gmail.com.");
    return false;
  }

  if (!isValidPhone(phone)) {
    const phoneField = signupForm.querySelector('input[name="phone"]');
    if (phoneField) markFieldInvalid(phoneField);
    showMessage(signupMessage, "error", "Phone number must be 11 digits and start with 01.");
    return false;
  }

  if (!username) {
    const usernameField = signupForm.querySelector('input[name="username"]');
    if (usernameField) markFieldInvalid(usernameField);
    showMessage(signupMessage, "error", "Username is required and must be unique.");
    return false;
  }

  const file = profileInput?.files?.[0];
  if (!file) {
    signupForm.classList.add("error");
    showMessage(signupMessage, "error", "Please upload a profile picture.");
    return false;
  }

  if (file.size > MAX_PROFILE_IMAGE_SIZE) {
    signupForm.classList.add("error");
    showMessage(
      signupMessage,
      "error",
      `Profile picture must be smaller than ${formatBytes(MAX_PROFILE_IMAGE_SIZE)}.`
    );
    return false;
  }

  const password = formData.get("password")?.toString().trim();
  const confirmPassword = formData.get("confirmPassword")?.toString().trim();

  if (password !== confirmPassword) {
    const passwordField = signupForm.querySelector('input[name="password"]');
    const confirmField = signupForm.querySelector('input[name="confirmPassword"]');
    if (passwordField) markFieldInvalid(passwordField);
    if (confirmField) markFieldInvalid(confirmField);
    showMessage(signupMessage, "error", "Passwords do not match.");
    return false;
  }

  return true;
}

async function signupUser(user) {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    body: user,
  });

  const responseText = await response.text();
  let data;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { message: responseText };
  }

  if (!response.ok) {
    const error = new Error(data.message || `Registration failed (${response.status}).`);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function collectSignupData() {
  const formData = new FormData(signupForm);
  formData.set("email", formData.get("email")?.toString().trim().toLowerCase() || "");
  formData.set("username", formData.get("username")?.toString().trim().toLowerCase() || "");
  formData.set("password", formData.get("password")?.toString().trim() || "");

  const file = profileInput?.files?.[0];
  if (file) {
    formData.set("profileImage", file);
  }

  return formData;
}

function bindSignupForm() {
  signupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateSignupForm()) {
      return;
    }

    try {
      const signupData = collectSignupData();
      const data = await signupUser(signupData);
      if (data.user) {
        const safeUser = { ...data.user };
        delete safeUser.password;
        localStorage.setItem("nirapodUser", JSON.stringify(safeUser));
        const session = { id: safeUser.id || safeUser._id, loginAt: new Date().toISOString() };
        localStorage.setItem("nirapodSession", JSON.stringify(session));
      }
      window.location.href = "/dashboard.html";
      return;
    } catch (error) {
      const message =
        error.statusCode === 413
          ? "Profile upload is too large. Please choose a smaller image file."
          : error.message || "Registration failed.";

      showMessage(signupMessage, "error", message);

      const emailField = signupForm.querySelector('input[name="email"]');
      const usernameField = signupForm.querySelector('input[name="username"]');

      if (message.toLowerCase().includes("username")) {
        if (usernameField) markFieldInvalid(usernameField);
      }

      if (message.toLowerCase().includes("email")) {
        if (emailField) markFieldInvalid(emailField);
      }
    }
  });
}

bindToggleButtons();
bindProfileUpload();
bindSignupForm();
