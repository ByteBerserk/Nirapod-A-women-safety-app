const storedUser = JSON.parse(localStorage.getItem('nirapodUser') || 'null');
const storedSession = JSON.parse(localStorage.getItem('nirapodSession') || 'null');
// prefer explicit session id, fallback to stored user id/_id
const userId = storedSession?.id || storedUser?.id || storedUser?._id;
const API_BASE_URL = `${window.location.origin}/api`;

let editingContactId = null;

const addContactBtn = document.getElementById('addContactBtn');
const addLockBtn = document.getElementById('addLockBtn');
const addContactModal = document.getElementById('addContactModal');
const addContactForm = document.getElementById('addContactForm');
const cancelAddContact = document.getElementById('cancelAddContact');
const contactName = document.getElementById('contactName');
const contactPhone = document.getElementById('contactPhone');
const contactEmail = document.getElementById('contactEmail');
const contactFormMessage = document.getElementById('contactFormMessage');
const contactsList = document.getElementById('contactsList');

let isAddLocked = false;

const isGmail = (email) => /^([^@\s]+)@gmail\.com$/i.test(email.trim());
const isPhoneValid = (p) => /^\+?[0-9\s\-()]{7,20}$/.test(p.trim());

const fetchContactsFromServer = async () => {
  if (!userId) return [];
  const res = await fetch(`${API_BASE_URL}/emergency/${userId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.contacts || [];
};

const addContactToServer = async (contact) => {
  if (!userId) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE_URL}/emergency/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const d = await res.json().catch(()=>({}));
    throw new Error(d.message || 'Unable to add contact');
  }
  const d = await res.json();
  return d.contact;
};

const updateContactOnServer = async (contactId, contact) => {
  if (!userId) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE_URL}/emergency/${userId}/${contactId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const d = await res.json().catch(()=>({}));
    throw new Error(d.message || 'Unable to update contact');
  }
  const d = await res.json();
  return d.contact;
};

const deleteContactFromServer = async (contactId) => {
  if (!userId) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE_URL}/emergency/${userId}/${contactId}`, { method: 'DELETE' });
  if (!res.ok) {
    const d = await res.json().catch(()=>({}));
    throw new Error(d.message || 'Unable to delete contact');
  }
  return true;
};

const renderContacts = async () => {
  const list = await fetchContactsFromServer();
  contactsList.innerHTML = '';
  if (!list || list.length === 0) {
    contactsList.innerHTML = '<div class="contact-card"><div class="contact-info"><div class="contact-name">No contacts yet</div><div class="contact-meta">Add trusted emergency contacts here.</div></div></div>';
    return;
  }

  list.forEach((c)=>{
    const contactId = c.id ?? (c._id ? c._id.toString() : "");
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.innerHTML = `
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(c.name)}</div>
        <div class="contact-meta">${escapeHtml(c.phone)} • ${escapeHtml(c.email)}</div>
      </div>
      <div class="contact-actions">
        <button class="update-contact" data-id="${escapeHtml(contactId)}">Update</button>
        <button class="remove-contact" data-id="${escapeHtml(contactId)}">Remove</button>
      </div>
    `;
    contactsList.appendChild(card);
  });

  contactsList.querySelectorAll('.remove-contact').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      try{
        await deleteContactFromServer(id);
        await renderContacts();
        showToast('Contact removed');
      }catch(err){
        showToast(err.message || 'Could not remove contact');
      }
    });
  });

  contactsList.querySelectorAll('.update-contact').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const list = await fetchContactsFromServer();
      const c = list.find(x=>x.id===id);
      if(!c) return;
      editingContactId = id;
      contactName.value = c.name;
      contactPhone.value = c.phone;
      contactEmail.value = c.email;
      contactFormMessage.textContent = '';
      addContactModal.classList.remove('hidden');
    });
  });
};

function escapeHtml(unsafe){
  return (''+unsafe).replace(/[&<>"]+/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
}

addContactBtn?.addEventListener('click', ()=>{
  editingContactId = null;
  addContactModal.classList.remove('hidden');
  contactFormMessage.textContent = '';
  contactName.value = '';
  contactPhone.value = '';
  contactEmail.value = '';
  contactName.focus();
});

addLockBtn?.addEventListener('click', ()=>{
  isAddLocked = !isAddLocked;
  updateLockUI();
  showToast(isAddLocked ? 'Emergency add locked' : 'Emergency add unlocked');
});

function updateLockUI(){
  if(!addLockBtn) return;
  addLockBtn.textContent = isAddLocked ? '🔒 Add Locked' : '🔓 Add Unlocked';
  addLockBtn.classList.toggle('locked', isAddLocked);
  if(addContactBtn){
    addContactBtn.disabled = isAddLocked;
    addContactBtn.classList.toggle('disabled', isAddLocked);
  }
}

cancelAddContact?.addEventListener('click', ()=>{
  addContactModal.classList.add('hidden');
});

addContactModal?.addEventListener('click', (e)=>{
  if(e.target===addContactModal) addContactModal.classList.add('hidden');
});

addContactForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = contactName.value.trim();
  const phone = contactPhone.value.trim();
  const email = contactEmail.value.trim();

  if(!name){ contactFormMessage.textContent = 'Name is required.'; return; }
  if(!isPhoneValid(phone)){ contactFormMessage.textContent = 'Enter a valid phone number.'; return; }
  if(!isGmail(email)){ contactFormMessage.textContent = 'Email must be a valid Gmail address.'; return; }

  try{
    if(editingContactId){
      await updateContactOnServer(editingContactId, { name, phone, email });
      showToast('Contact updated');
    }else{
      await addContactToServer({ name, phone, email });
      showToast('Contact added');
    }
    editingContactId = null;
    await renderContacts();
    addContactModal.classList.add('hidden');
  }catch(err){
    contactFormMessage.textContent = err.message || 'Unable to save contact.';
  }
});

// initialize on DOM ready
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', ()=>{
    updateLockUI();
    renderContacts();
  });
}else{
  updateLockUI();
  renderContacts();
}

// inject toast container
function showToast(message, duration=2200){
  let tc = document.querySelector('.toast-container');
  if(!tc){
    tc = document.createElement('div');
    tc.className = 'toast-container';
    document.body.appendChild(tc);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  tc.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),250); }, duration);
}

// expose render for external calls if needed
export { renderContacts };
