import {
  isAuthConfigured,
  isLoggedIn,
  getUser,
  signInWithPassword,
  signUpWithPassword,
  signOut,
  onAuthStateChange,
  requestPasswordReset,
  updatePassword
} from "../core/auth.js";
import { getProfileFirstName, loadUserProfile, saveProfileFirstName, clearProfileCache } from "../core/profile.js";

let authConfigured = false;
let onOpenWordBank = null;
let authMode = "signin";

function getElements() {
  return {
    bar: document.getElementById("authBar"),
    signInBtn: document.getElementById("authSignInBtn"),
    profileBtn: document.getElementById("authProfileBtn"),
    profileName: document.getElementById("authProfileName"),
    menu: document.getElementById("authMenu"),
    modal: document.getElementById("authModal"),
    form: document.getElementById("authForm"),
    modalTitle: document.getElementById("authModalTitle"),
    modalLead: document.getElementById("authModalLead"),
    modeTabs: document.getElementById("authModeTabs"),
    firstNameField: document.getElementById("authFirstNameField"),
    firstNameInput: document.getElementById("authFirstName"),
    emailInput: document.getElementById("authEmail"),
    emailLabel: document.querySelector('label[for="authEmail"]'),
    passwordField: document.getElementById("authPasswordField"),
    passwordInput: document.getElementById("authPassword"),
    forgotPasswordBtn: document.getElementById("authForgotPasswordBtn"),
    newPasswordField: document.getElementById("authNewPasswordField"),
    newPasswordInput: document.getElementById("authNewPassword"),
    confirmPasswordInput: document.getElementById("authConfirmPassword"),
    submitBtn: document.getElementById("authSubmitBtn"),
    toggleModeBtn: document.getElementById("authToggleModeBtn"),
    signInTab: document.getElementById("authSignInTab"),
    signUpTab: document.getElementById("authSignUpTab"),
    message: document.getElementById("authMessage"),
    wordBankMenuBtn: document.getElementById("authWordBankBtn"),
    signOutBtn: document.getElementById("authSignOutBtn")
  };
}

function closeMenu() {
  const { menu } = getElements();
  if (menu) menu.hidden = true;
}

function resetModalForm() {
  const {
    form,
    message,
    passwordInput,
    newPasswordInput,
    confirmPasswordInput
  } = getElements();

  if (form) form.hidden = false;
  if (message) {
    message.hidden = true;
    message.textContent = "";
  }
  if (passwordInput) passwordInput.value = "";
  if (newPasswordInput) newPasswordInput.value = "";
  if (confirmPasswordInput) confirmPasswordInput.value = "";
}

function closeModal() {
  const { modal } = getElements();
  if (modal) modal.hidden = true;
  resetModalForm();
  setAuthMode("signin");
}

function setAuthMode(mode) {
  authMode = ["signup", "reset", "newpassword"].includes(mode) ? mode : "signin";

  const {
    modalTitle,
    modalLead,
    modeTabs,
    firstNameField,
    firstNameInput,
    emailLabel,
    emailInput,
    passwordField,
    passwordInput,
    forgotPasswordBtn,
    newPasswordField,
    newPasswordInput,
    confirmPasswordInput,
    submitBtn,
    toggleModeBtn,
    signInTab,
    signUpTab
  } = getElements();

  const isSignup = authMode === "signup";
  const isReset = authMode === "reset";
  const isNewPassword = authMode === "newpassword";
  const isSignin = authMode === "signin";

  if (modalTitle) {
    if (isReset) modalTitle.textContent = "Reset password";
    else if (isNewPassword) modalTitle.textContent = "Choose new password";
    else modalTitle.textContent = isSignup ? "Create account" : "Sign in";
  }

  if (modalLead) {
    if (isReset) {
      modalLead.textContent =
        "Enter your email and we'll send you a link to reset your password.";
    } else if (isNewPassword) {
      modalLead.textContent = "Enter a new password for your account.";
    } else {
      modalLead.textContent = isSignup
        ? "Create an account to save settings and build your word bank."
        : "Welcome back. Enter your email and password.";
    }
  }

  if (modeTabs) {
    modeTabs.hidden = isReset || isNewPassword;
  }

  if (emailLabel) emailLabel.hidden = isNewPassword;
  if (emailInput) {
    emailInput.hidden = isNewPassword;
    emailInput.required = !isNewPassword;
  }

  if (firstNameField) {
    firstNameField.hidden = !isSignup;
  }

  if (firstNameInput) {
    firstNameInput.required = isSignup;
    if (!isSignup) firstNameInput.value = "";
  }

  if (passwordField) {
    passwordField.hidden = isReset || isNewPassword;
  }

  if (passwordInput) {
    passwordInput.required = isSignin || isSignup;
    passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
    if (isReset || isNewPassword) passwordInput.value = "";
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.hidden = !isSignin;
  }

  if (newPasswordField) {
    newPasswordField.hidden = !isNewPassword;
  }

  if (newPasswordInput) {
    newPasswordInput.required = isNewPassword;
    if (!isNewPassword) newPasswordInput.value = "";
  }

  if (confirmPasswordInput) {
    confirmPasswordInput.required = isNewPassword;
    if (!isNewPassword) confirmPasswordInput.value = "";
  }

  if (submitBtn) {
    if (isReset) submitBtn.textContent = "Send reset link";
    else if (isNewPassword) submitBtn.textContent = "Update password";
    else submitBtn.textContent = isSignup ? "Create account" : "Sign in";
  }

  if (toggleModeBtn) {
    toggleModeBtn.hidden = isNewPassword;
    if (isReset) {
      toggleModeBtn.textContent = "Back to sign in";
    } else {
      toggleModeBtn.textContent = isSignup
        ? "Already have an account? Sign in"
        : "New here? Create an account";
    }
  }

  signInTab?.classList.toggle("active", isSignin);
  signUpTab?.classList.toggle("active", isSignup);
  signInTab?.setAttribute("aria-selected", isSignin ? "true" : "false");
  signUpTab?.setAttribute("aria-selected", isSignup ? "true" : "false");

  if (isNewPassword) {
    newPasswordInput?.focus();
  } else if (isSignup) {
    firstNameInput?.focus();
  } else {
    emailInput?.focus();
  }
}

function openModal(mode = "signin") {
  const { modal } = getElements();
  if (!modal) return;
  resetModalForm();
  modal.hidden = false;
  closeMenu();
  setAuthMode(mode);
}

function showModalMessage(text) {
  const { form, message } = getElements();
  if (form) form.hidden = true;
  if (message) {
    message.hidden = false;
    message.textContent = text;
  }
}

function updateAuthUI() {
  const { bar, signInBtn, profileBtn, profileName } = getElements();

  if (!bar) return;

  if (!authConfigured) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;

  if (isLoggedIn()) {
    signInBtn.hidden = true;
    profileBtn.hidden = false;
    profileName.textContent = getProfileFirstName();
    profileBtn.setAttribute(
      "aria-label",
      `Signed in as ${getUser()?.email || "user"}`
    );
  } else {
    signInBtn.hidden = false;
    profileBtn.hidden = true;
    if (profileName) profileName.textContent = "";
    closeMenu();
  }
}

export function initAuthPanel(options = {}) {
  onOpenWordBank = options.onOpenWordBank || null;
  authConfigured = isAuthConfigured();

  const {
    signInBtn,
    profileBtn,
    menu,
    modal,
    form,
    signInTab,
    signUpTab,
    toggleModeBtn,
    forgotPasswordBtn,
    firstNameInput,
    emailInput,
    passwordInput,
    newPasswordInput,
    confirmPasswordInput,
    submitBtn,
    wordBankMenuBtn,
    signOutBtn
  } = getElements();

  signInBtn?.addEventListener("click", () => openModal("signin"));

  profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!menu) return;
    menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!menu || menu.hidden) return;
    if (e.target.closest("#authProfileBtn") || e.target.closest("#authMenu")) {
      return;
    }
    closeMenu();
  });

  modal?.querySelectorAll("[data-auth-close]").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });

  signInTab?.addEventListener("click", () => setAuthMode("signin"));
  signUpTab?.addEventListener("click", () => setAuthMode("signup"));
  toggleModeBtn?.addEventListener("click", () => {
    if (authMode === "reset") {
      setAuthMode("signin");
      return;
    }
    setAuthMode(authMode === "signup" ? "signin" : "signup");
  });
  forgotPasswordBtn?.addEventListener("click", () => setAuthMode("reset"));

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value || "";
    const firstName = firstNameInput?.value?.trim();
    const newPassword = newPasswordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";

    if (authMode === "reset") {
      if (!email) return;
    } else if (authMode === "newpassword") {
      if (!newPassword || !confirmPassword) return;
      if (newPassword !== confirmPassword) {
        showModalMessage("Passwords do not match.");
        if (form) form.hidden = false;
        return;
      }
    } else {
      if (!email || !password) return;
      if (authMode === "signup" && !firstName) return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      if (authMode === "reset") {
        await requestPasswordReset({ email });
        showModalMessage("Check your email for a link to reset your password.");
        return;
      }

      if (authMode === "newpassword") {
        await updatePassword({ password: newPassword });
        closeModal();
        return;
      }

      if (authMode === "signup") {
        const { session, needsEmailConfirmation } = await signUpWithPassword({
          email,
          password,
          firstName
        });

        if (session) {
          await saveProfileFirstName(firstName);
          closeModal();
          return;
        }

        if (needsEmailConfirmation) {
          showModalMessage("Check your email to confirm your account, then sign in.");
          return;
        }

        showModalMessage("Account created. You can sign in now.");
        setAuthMode("signin");
        if (form) form.hidden = false;
        if (passwordInput) passwordInput.value = "";
        return;
      }

      await signInWithPassword({ email, password });
      closeModal();
    } catch (err) {
      showModalMessage(err.message || "Could not complete sign in.");
      if (form) form.hidden = false;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  wordBankMenuBtn?.addEventListener("click", () => {
    closeMenu();
    onOpenWordBank?.();
  });

  signOutBtn?.addEventListener("click", async () => {
    closeMenu();
    try {
      await signOut();
    } catch {
      /* ignore */
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) {
      closeModal();
    }
  });

  onAuthStateChange(async (session, event) => {
    if (event === "PASSWORD_RECOVERY") {
      openModal("newpassword");
      return;
    }

    if (isLoggedIn()) {
      try {
        await loadUserProfile();
      } catch {
        /* ignore */
      }
    } else {
      clearProfileCache();
    }
    updateAuthUI();
  });

  if (isLoggedIn()) {
    loadUserProfile().finally(() => updateAuthUI());
  } else {
    updateAuthUI();
  }
}

export function openAuthPanel() {
  openModal("signin");
}
