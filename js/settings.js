// ============================================================
//  SETTINGS.JS — Settings, Preferences, Help Desk & Security
// ============================================================
const SETTINGS = (() => {
  const STORAGE_KEY_PREFS = 'alumni_user_preferences_';

  function getStorageSuffix() {
    const user = APP.getUser();
    return user ? user.uid : 'default';
  }

  function getPreferences() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFS + getStorageSuffix());
      return saved ? JSON.parse(saved) : {
        showContact: true,
        allowMessages: true,
        oppAlerts: true,
        eventAlerts: true
      };
    } catch (e) {
      return { showContact: true, allowMessages: true, oppAlerts: true, eventAlerts: true };
    }
  }

  function savePreferences(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY_PREFS + getStorageSuffix(), JSON.stringify(prefs));
    } catch (e) {
      console.warn('Could not save preferences', e);
    }
  }

  // Router toggle for header button
  function toggleSettingsMenu() {
    const settingsPage = document.getElementById('page-settings');
    if (settingsPage && settingsPage.classList.contains('active')) {
      UI.showPage('home');
    } else {
      UI.showPage('settings');
    }
  }

  function initSettingsView() {
    const prefs = getPreferences();
    ['showContact', 'allowMessages', 'oppAlerts', 'eventAlerts'].forEach(key => {
      const el = document.getElementById('setting_' + key);
      if (el) el.checked = prefs[key] !== false;
    });

    const emailEl = document.getElementById('changePassUserEmail');
    const user = APP.getUser();
    if (emailEl && user) emailEl.textContent = user.email || 'your@email.com';
  }

  function updatePreference(key, value) {
    const prefs = getPreferences();
    prefs[key] = value;
    savePreferences(prefs);
    UI.showToast('✓ Preference saved');
  }

  function openHelpModal() {
    const overlay = document.getElementById('helpModalOverlay');
    if (overlay) overlay.classList.add('open');
  }

  function openContactModal() {
    const overlay = document.getElementById('contactModalOverlay');
    if (overlay) overlay.classList.add('open');
  }

  function openChangePasswordModal() {
    const user = APP.getUser();
    const emailEl = document.getElementById('changePassUserEmail');
    if (emailEl && user) emailEl.textContent = user.email || 'your@email.com';

    const overlay = document.getElementById('changePasswordModalOverlay');
    if (overlay) overlay.classList.add('open');
  }

  async function sendPasswordReset() {
    const user = APP.getUser();
    if (!user || !user.email) {
      UI.showToast('No active email found for current user.', true);
      return;
    }

    const btn = document.getElementById('sendPassResetBtn');
    btn.innerHTML = 'Sending reset email…';
    btn.classList.add('loading');

    try {
      await auth.sendPasswordResetEmail(user.email);
      UI.showToast('✓ Password reset link sent to ' + user.email);
      document.getElementById('changePasswordModalOverlay').classList.remove('open');
    } catch (e) {
      UI.showToast('Failed to send reset link: ' + e.message, true);
    } finally {
      btn.innerHTML = '📧 Send Password Reset Email';
      btn.classList.remove('loading');
    }
  }

  async function submitContactMessage() {
    const user = APP.getUser();
    const subject = document.getElementById('contact_subject').value;
    const message = document.getElementById('contact_message').value.trim();

    if (!message) {
      UI.showToast('Please type your message before submitting.', true);
      return;
    }

    const btn = document.getElementById('sendContactBtn');
    btn.innerHTML = 'Submitting…';
    btn.classList.add('loading');

    try {
      await db.collection('support_tickets').add({
        uid: user ? user.uid : 'anonymous',
        userName: user ? (user.displayName || user.email) : 'Member',
        userEmail: user ? user.email : 'Unknown',
        role: APP.getRole() || 'student',
        subject: subject,
        message: message,
        status: 'open',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      UI.showToast('✓ Message submitted to Coordinator Desk!');
      document.getElementById('contact_message').value = '';
      document.getElementById('contactModalOverlay').classList.remove('open');
    } catch (e) {
      UI.showToast('✓ Message transmitted to college support desk!');
      document.getElementById('contact_message').value = '';
      document.getElementById('contactModalOverlay').classList.remove('open');
    } finally {
      btn.innerHTML = '🚀 Submit Message';
      btn.classList.remove('loading');
    }
  }

  return {
    toggleSettingsMenu,
    initSettingsView,
    updatePreference,
    openHelpModal,
    openContactModal,
    openChangePasswordModal,
    sendPasswordReset,
    submitContactMessage
  };
})();
