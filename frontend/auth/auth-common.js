export function showMessage(element, type, text) {
  element.className = `form-message ${type}`;
  element.textContent = text;
}

export function bindToggleButtons() {
  const toggleButtons = document.querySelectorAll(".toggle-btn");
  const signupForm = document.getElementById("signupForm");
  const loginForm = document.getElementById("loginForm");

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      toggleButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      if (button.dataset.form === "login") {
        signupForm.classList.remove("active");
        loginForm.classList.add("active");
      } else {
        loginForm.classList.remove("active");
        signupForm.classList.add("active");
      }
    });
  });
}

export function switchAuthTab(formName) {
  const loginButton = document.querySelector('.toggle-btn[data-form="login"]');
  const signupButton = document.querySelector('.toggle-btn[data-form="signup"]');
  const signupForm = document.getElementById("signupForm");
  const loginForm = document.getElementById("loginForm");

  if (formName === "login" && loginButton && signupButton && signupForm && loginForm) {
    signupButton.classList.remove("active");
    loginButton.classList.add("active");
    signupForm.classList.remove("active");
    loginForm.classList.add("active");
  }
}
