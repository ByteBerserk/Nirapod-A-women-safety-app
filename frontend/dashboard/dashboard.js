const API_BASE_URL = `${window.location.origin}/api`;
const storedUser = JSON.parse(localStorage.getItem("nirapodUser") || "null");
const storedSession = JSON.parse(localStorage.getItem("nirapodSession") || "null");
let userProfile = storedUser;

const getCurrentUserId = () => storedSession?.id || userProfile?.id || userProfile?._id;
const currentUserId = getCurrentUserId();

const pageTitle = document.getElementById("pageTitle");
const pageDescription = document.getElementById("pageDescription");
const welcomeName = document.getElementById("welcomeName");
const profileAvatar = document.getElementById("profileAvatar");
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");
const profilePhone = document.getElementById("profilePhone");
const profileFullName = document.getElementById("profileFullName");
const profileEmailField = document.getElementById("profileEmailField");
const profileUsername = document.getElementById("profileUsername");
const profilePhoneField = document.getElementById("profilePhoneField");
const profileBloodGroup = document.getElementById("profileBloodGroup");
const profileGender = document.getElementById("profileGender");
const profileJob = document.getElementById("profileJob");
const profileMedicalInfo = document.getElementById("profileMedicalInfo");
const profileAddress = document.getElementById("profileAddress");
const logoutBtn = document.getElementById("logoutBtn");
const changePhotoBtn = document.getElementById("changePhotoBtn");
const profilePhotoInput = document.getElementById("profilePhotoInput");
const homeSection = document.getElementById("homeSection");
const manageSection = document.getElementById("manageSection");
<<<<<<< HEAD
=======
const emergencySection =document.getElementById("emergencySection");
const messagesSection = document.getElementById("messagesSection");
>>>>>>> feature/group-messaging-location
const goToManageBtn = document.getElementById("goToManageBtn");
const updateModal = document.getElementById("updateModal");
const modalTitle = document.getElementById("modalTitle");
const modalFieldLabel = document.getElementById("modalFieldLabel");
const modalInput = document.getElementById("modalInput");
const modalSelect = document.getElementById("modalSelect");
const updateForm = document.getElementById("updateForm");
const cancelBtn = document.getElementById("cancelBtn");
const modalMessage = document.getElementById("modalMessage");

let activeField = null;

const fieldMap = {
  fullName: { label: "Full Name", type: "text" },
  email: { label: "Email", type: "email" },
  username: { label: "Username", type: "text" },
  phone: { label: "Phone", type: "tel" },
  bloodGroup: {
    label: "Blood Group",
    type: "select",
    options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  },
  gender: {
    label: "Gender",
    type: "select",
    options: ["Female", "Male", "Non-binary", "Prefer not to say"],
  },
  job: {
    label: "Job",
    type: "select",
    options: ["Student", "Teacher", "Engineer", "Doctor", "Other Profession"],
  },
  medicalInfo: { label: "Medical Info", type: "text" },
  address: { label: "Address", type: "text" },
};

const sidebarLinks = Array.from(document.querySelectorAll(".sidebar-link"));

const redirectToLogin = () => {
  localStorage.removeItem("nirapodUser");
  localStorage.removeItem("nirapodActivePage");
  localStorage.removeItem("nirapodSession");
  window.location.href = "/index.html";
};

if (!currentUserId) {
  redirectToLogin();
}

const setActivePage = (page) => {
  sidebarLinks.forEach((link) => {
    const isActive = link.dataset.page === page;
    link.classList.toggle("active", isActive);
  });

  localStorage.setItem("nirapodActivePage", page);

  if (page === "home") {
<<<<<<< HEAD
=======
    if (messagesSection) messagesSection.classList.add("hidden");
>>>>>>> feature/group-messaging-location
    pageTitle.textContent = "Home";
    pageDescription.textContent = "Your secure member home page with fast access to profile actions.";
    homeSection.classList.remove("hidden");
    manageSection.classList.add("hidden");
    const emergencySection = document.getElementById("emergencySection");
    if (emergencySection) emergencySection.classList.add("hidden");
  } else {
    if (page === "manage"){
<<<<<<< HEAD
=======
      if (messagesSection) messagesSection.classList.add("hidden");
>>>>>>> feature/group-messaging-location
      pageTitle.textContent = "Manage User";
      pageDescription.textContent = "Update profile details and manage your account settings.";
      homeSection.classList.add("hidden");
      manageSection.classList.remove("hidden");
      const emergencySection = document.getElementById("emergencySection");
      if (emergencySection) emergencySection.classList.add("hidden");
    } else if (page === "emergency"){
<<<<<<< HEAD
=======
      if (messagesSection) messagesSection.classList.add("hidden");
>>>>>>> feature/group-messaging-location
      pageTitle.textContent = "Emergency Contacts";
      pageDescription.textContent = "Manage your trusted emergency contacts.";
      homeSection.classList.add("hidden");
      manageSection.classList.add("hidden");
      const emergencySection = document.getElementById("emergencySection");
      if (emergencySection) emergencySection.classList.remove("hidden");
<<<<<<< HEAD
<<<<<<< HEAD
=======
    } else if (page === "community") {
      window.location.href = "/community/community.html";
      return;
>>>>>>> promitDev
    }
=======
    } else if (page === "messages") {
      pageTitle.textContent = "Messages";
      pageDescription.textContent = "View and send messages to your contacts.";
      homeSection.classList.add("hidden");
      manageSection.classList.add("hidden");
      const emergencySection = document.getElementById("emergencySection");
      if (emergencySection) emergencySection.classList.add("hidden");
      messagesSection.classList.remove("hidden");
      if (messagesSection) messagesSection.classList.remove("hidden");
    } 
>>>>>>> feature/group-messaging-location
  }
};

const fetchProfile = async () => {
  const id = getCurrentUserId();
  if (!id) {
    redirectToLogin();
    return;
  }

  const response = await fetch(`${API_BASE_URL}/profile/${id}`);
  if (!response.ok) {
    redirectToLogin();
    return;
  }

  const data = await response.json();
  userProfile = data.user;
  localStorage.setItem("nirapodUser", JSON.stringify(userProfile));
  renderProfile();
};

const renderProfile = () => {
  const avatarUrl = userProfile.profileImage || "https://via.placeholder.com/120?text=Avatar";
  profileAvatar.src = avatarUrl;
  welcomeName.textContent = userProfile.fullName || userProfile.username;
  profileName.textContent = userProfile.fullName || userProfile.username;
  profileEmail.textContent = userProfile.email;
  profilePhone.textContent = userProfile.phone;
  profileFullName.textContent = userProfile.fullName;
  profileEmailField.textContent = userProfile.email;
  profileUsername.textContent = userProfile.username;
  profilePhoneField.textContent = userProfile.phone;
  profileBloodGroup.textContent = userProfile.bloodGroup;
  profileGender.textContent = userProfile.gender;
  profileJob.textContent = userProfile.job;
  profileMedicalInfo.textContent = userProfile.medicalInfo;
  profileAddress.textContent = userProfile.address;
};

const showModal = (field) => {
  activeField = field;
  const fieldConfig = fieldMap[field];
  modalTitle.textContent = `Update ${fieldConfig.label}`;
  modalFieldLabel.textContent = fieldConfig.label;
  modalMessage.textContent = "";

  if (fieldConfig.type === "select") {
    modalInput.classList.add("hidden");
    modalInput.removeAttribute("required");
    modalSelect.classList.remove("hidden");
    modalSelect.setAttribute("required", "");
    modalSelect.innerHTML = ["", ...fieldConfig.options]
      .map((option) => `<option value="${option}">${option || `Select ${fieldConfig.label}`}</option>`)
      .join("");
    modalSelect.value = userProfile[field] || "";
    modalSelect.focus();
  } else {
    modalSelect.classList.add("hidden");
    modalSelect.removeAttribute("required");
    modalInput.classList.remove("hidden");
    modalInput.type = fieldConfig.type;
    modalInput.value = userProfile[field] || "";
    modalInput.placeholder = `Enter your ${fieldConfig.label.toLowerCase()}`;
    modalInput.setAttribute("required", "");
    modalInput.focus();
  }

  updateModal.classList.remove("hidden");
};

const hideModal = () => {
  activeField = null;
  updateModal.classList.add("hidden");
};

const validateField = (field, value) => {
  if (field === "medicalInfo") {
    return null;
  }

  if (!value.trim()) {
    return `${fieldMap[field].label} is required.`;
  }

  if (field === "email" && !/^([^@\s]+)@gmail\.com$/i.test(value.trim())) {
    return "Email must be a valid Gmail address.";
  }

  if (field === "phone" && !/^01\d{9}$/.test(value.trim())) {
    return "Phone number must be an 11-digit Bangladeshi number starting with 01.";
  }

  return null;
};

const updateUserProfile = async (updatedAttributes) => {
  const id = getCurrentUserId();
  const payload = {
    ...userProfile,
    ...updatedAttributes,
  };
  // ensure id is present in the request body so backend can match by id or _id
  payload.id = id;

  const response = await fetch(`${API_BASE_URL}/profile/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Unable to update profile.");
  }

  return data.user;
};

const initUpdateButtons = () => {
  document.querySelectorAll(".update-field-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.field;
      showModal(field);
    });
  });
};

const fileToFormData = async (file) => {
  const formData = new FormData();
  formData.append("profileImage", file);
  formData.append("fullName", userProfile.fullName);
  formData.append("email", userProfile.email);
  formData.append("username", userProfile.username);
  formData.append("phone", userProfile.phone);
  formData.append("bloodGroup", userProfile.bloodGroup);
  formData.append("gender", userProfile.gender);
  formData.append("job", userProfile.job);
  formData.append("medicalInfo", userProfile.medicalInfo);
  formData.append("address", userProfile.address);
  return formData;
};

const uploadProfilePhoto = async (file) => {
  const formData = await fileToFormData(file);

  const id = getCurrentUserId();
  formData.append("id", id);
  const response = await fetch(`${API_BASE_URL}/profile/${id}`, {
    method: "PUT",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Unable to update profile image.");
  }

  return data.user;
};

profilePhotoInput?.addEventListener("change", async () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;
  try {
    const updated = await uploadProfilePhoto(file);
    userProfile = updated;
    localStorage.setItem("nirapodUser", JSON.stringify(userProfile));
    renderProfile();
    // close any open UI and reload so changes mirror Emergency flow
    hideModal();
    window.location.reload();
  } catch (err) {
    alert(err.message || "Could not update photo.");
  }
});

changePhotoBtn?.addEventListener("click", () => {
  profilePhotoInput?.click();
});

goToManageBtn?.addEventListener("click", () => setActivePage("manage"));

updateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeField) return;
  const fieldConfig = fieldMap[activeField];
  const value = fieldConfig.type === "select"
    ? modalSelect.value.trim()
    : modalInput.value.trim();
  const error = validateField(activeField, value);
  if (error) {
    modalMessage.textContent = error;
    modalMessage.className = "form-message error";
    return;
  }

  const updateData = { [activeField]: value };
  try {
    const updated = await updateUserProfile(updateData);
    userProfile = updated;
    localStorage.setItem("nirapodUser", JSON.stringify(userProfile));
    renderProfile();
    hideModal();
    // Ensure the UI reflects any server-side changes by reloading
    // (keeps behavior consistent across photo uploads and other fields)
    window.location.reload();
  } catch (err) {
    modalMessage.textContent = err.message;
    modalMessage.className = "form-message error";
  }
});

cancelBtn?.addEventListener("click", hideModal);
logoutBtn?.addEventListener("click", redirectToLogin);
updateModal?.addEventListener("click", (event) => {
  if (event.target === updateModal) hideModal();
});

sidebarLinks.forEach((link) => {
  link.addEventListener("click", () => setActivePage(link.dataset.page));
});

if (!getCurrentUserId()) {
  redirectToLogin();
} else {
  const savedPage = localStorage.getItem("nirapodActivePage") || "home";
  setActivePage(savedPage);
  fetchProfile().then(initUpdateButtons).catch(redirectToLogin);
}
