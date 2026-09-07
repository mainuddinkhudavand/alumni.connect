// ============================================================
//  AUTH.JS — Login, Register, Forgot Password & Year Loops
// ============================================================
const AUTH = (() => {
  const USN_PREFIX = '2TG';
  const USN_PATTERN = /^2TG\d{2}[A-Z]{2,4}\d{3}$/;
  let _forgotEmail = '';
  let _regType = 'student'; // 'student' | 'alumni'

  // ── Page navigation ──
  function showLogin() {
    _set('loginPage', 'flex');
    _set('registerPage', 'none');
    _set('forgotPage', 'none');
    document.getElementById('mainApp').classList.remove('active');
  }

  function showRegister() {
    _set('loginPage', 'none');
    _set('registerPage', 'block');
    _set('forgotPage', 'none');
    document.getElementById('mainApp').classList.remove('active');
    // Reset to Student type
    _regType = 'student';
    const studentBtn = document.getElementById('regTypeStudent');
    const alumniBtn = document.getElementById('regTypeAlumni');
    if (studentBtn) studentBtn.classList.add('active');
    if (alumniBtn) alumniBtn.classList.remove('active');
    ['regYearField', 'regLinkedinField', 'regGithubField', 'regCareerSection'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    ['regYear', 'regLinkedin', 'regGithub', 'regStatus', 'regCompany', 'regRole', 'regCity', 'regBio', 'regPhone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function showForgot() {
    _set('loginPage', 'none');
    _set('registerPage', 'none');
    _set('forgotPage', 'block');
    document.getElementById('mainApp').classList.remove('active');
    document.getElementById('forgotStep1').style.display = 'block';
    document.getElementById('forgotStep2').style.display = 'none';
    document.getElementById('forgotEmail').value = '';
    document.getElementById('forgotError').classList.remove('show');
  }

  function showApp() {
    _set('loginPage', 'none');
    _set('registerPage', 'none');
    _set('forgotPage', 'none');
    document.getElementById('mainApp').classList.add('active');
  }

  function _set(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  }

  // ── Live USN Validation ──
  function validateUSN(inputEl) {
    const val = inputEl.value.toUpperCase();
    inputEl.value = val;
    const hintId = inputEl.id === 'f_usn' ? 'f_usnHint' : 'usnHint';
    const hint = document.getElementById(hintId);
    if (!hint) return;

    if (!val) {
      hint.innerHTML = 'Must start with 2TG (e.g. 2TG21CS001)';
      hint.style.color = 'var(--muted)';
      inputEl.style.borderColor = '';
      return;
    }
    if (!val.startsWith(USN_PREFIX)) {
      hint.innerHTML = '❌ USN must start with 2TG — you typed "' + val.slice(0, 3) + '"';
      hint.style.color = 'var(--red)';
      inputEl.style.borderColor = 'var(--red)';
      return;
    }
    if (val.length < 7) {
      hint.innerHTML = '⌛ Keep typing… ' + val;
      hint.style.color = 'var(--muted)';
      inputEl.style.borderColor = 'var(--accent)';
      return;
    }
    if (USN_PATTERN.test(val)) {
      hint.innerHTML = '✓ Valid: ' + val;
      hint.style.color = 'var(--green)';
      inputEl.style.borderColor = 'var(--green)';
    } else {
      hint.innerHTML = '⚠ Format: 2TG + year(2 digits) + branch(2–4 letters) + roll(3 digits). E.g. 2TG21CS001';
      hint.style.color = 'var(--gold)';
      inputEl.style.borderColor = 'var(--gold)';
    }
  }

  // ── Login ──
  async function login() {
    const roleEl = document.querySelector('.role-btn.active');
    const role = roleEl ? roleEl.dataset.role : 'student';
    const emailOrUsn = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    errEl.classList.remove('show');

    if (!emailOrUsn || !password) {
      _err(errEl, 'Please fill in all fields.');
      return;
    }

    btn.innerHTML = '⚡ Signing in…';
    btn.classList.add('loading');

    try {
      let email = emailOrUsn;
      if (!emailOrUsn.includes('@')) {
        const snap = await db.collection('alumni').where('usn', '==', emailOrUsn.toUpperCase()).limit(1).get();
        if (snap.empty) throw new Error('USN not found. Please use your registered email.');
        email = snap.docs[0].data().email;
        if (!email) throw new Error('No email linked to this USN. Contact admin.');
      }

      const cred = await auth.signInWithEmailAndPassword(email, password);
      const adminDoc = await db.collection('admins').doc(cred.user.uid).get();
      const isAdmin = adminDoc.exists;

      if (role === 'admin' && !isAdmin) {
        await auth.signOut();
        throw new Error('You are not registered as a coordinator.');
      }

      let finalRole = 'student';
      if (isAdmin) {
        finalRole = 'admin';
      } else {
        const alumniDoc = await db.collection('alumni').doc(cred.user.uid).get();
        if (alumniDoc.exists) {
          const aData = alumniDoc.data();
          if (aData.accountType === 'alumni' || (aData.year && String(aData.year).length === 4)) {
            finalRole = 'alumni';
          }
        }
      }

      APP.initUser(cred.user, finalRole);
      showApp();
    } catch (e) {
      _err(errEl, _friendly(e.message));
    } finally {
      btn.innerHTML = 'Sign In';
      btn.classList.remove('loading');
    }
  }

  // ── Register Type Toggle ──
  function switchRegType(type, btn) {
    _regType = type;
    document.querySelectorAll('#registerPage .role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const isAlumni = type === 'alumni';
    document.getElementById('regYearField').style.display = isAlumni ? 'block' : 'none';
    document.getElementById('regLinkedinField').style.display = isAlumni ? 'block' : 'none';
    document.getElementById('regGithubField').style.display = isAlumni ? 'block' : 'none';
    document.getElementById('regCareerSection').style.display = isAlumni ? 'block' : 'none';

    // Reset conditional fields when switching back to Student
    if (!isAlumni) {
      ['regYear', 'regLinkedin', 'regGithub', 'regStatus', 'regCompany', 'regRole', 'regCity', 'regBio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    }
  }

  // ── Register ──
  async function register() {
    const name = document.getElementById('regName').value.trim();
    const usn = document.getElementById('regUSN').value.trim().toUpperCase();
    const branch = document.getElementById('regBranch').value;
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone') ? document.getElementById('regPhone').value.trim() : '';
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    const errEl = document.getElementById('registerError');
    const btn = document.getElementById('registerBtn');
    errEl.classList.remove('show');

    const isAlumni = _regType === 'alumni';
    const year = isAlumni ? document.getElementById('regYear').value : '';
    const linkedin = isAlumni ? document.getElementById('regLinkedin').value.trim() : '';
    const github = isAlumni ? document.getElementById('regGithub').value.trim() : '';
    const status = isAlumni ? document.getElementById('regStatus').value : '';
    const company = isAlumni ? document.getElementById('regCompany').value.trim() : '';
    const jobRole = isAlumni ? document.getElementById('regRole').value.trim() : '';
    const city = isAlumni ? document.getElementById('regCity').value.trim() : '';
    const bio = isAlumni ? document.getElementById('regBio').value.trim() : '';

    // Common validations
    if (!name || !usn || !branch || !email || !password || !confirm) {
      _err(errEl, 'Please fill in all required fields.'); return;
    }
    if (!usn.startsWith(USN_PREFIX)) { _err(errEl, 'USN must start with "2TG". Example: 2TG21CS001'); return; }
    if (!USN_PATTERN.test(usn)) { _err(errEl, 'Invalid USN format.'); return; }
    if (password.length < 6) { _err(errEl, 'Password must be at least 6 characters.'); return; }
    if (password !== confirm) { _err(errEl, 'Passwords do not match.'); return; }

    // Alumni-specific validations
    if (isAlumni) {
      if (!year) { _err(errEl, 'Year of Passing is required for Alumni accounts.'); return; }
      if (!linkedin) { _err(errEl, 'LinkedIn Profile URL is required for Alumni accounts.'); return; }
      if (!github) { _err(errEl, 'GitHub Profile URL is required for Alumni accounts.'); return; }
      if (!linkedin.includes('linkedin.com')) { _err(errEl, 'Please enter a valid LinkedIn profile URL.'); return; }
      if (!github.includes('github.com')) { _err(errEl, 'Please enter a valid GitHub profile URL.'); return; }
    }

    btn.innerHTML = '⚙️ Creating account…';
    btn.classList.add('loading');
    try {
      const usnSnap = await db.collection('alumni').where('usn', '==', usn).limit(1).get();
      if (!usnSnap.empty) throw new Error('This USN is already registered. Try logging in.');
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await db.collection('alumni').doc(cred.user.uid).set({
        uid: cred.user.uid, name, usn, branch,
        year: isAlumni ? year : '',
        email,
        accountType: isAlumni ? 'alumni' : 'student',
        status: isAlumni ? status : '',
        company: isAlumni ? company : '',
        role: isAlumni ? jobRole : '',
        city: isAlumni ? city : '',
        bio: isAlumni ? bio : '',
        linkedin: isAlumni ? linkedin : '',
        github: isAlumni ? github : '',
        phone,
        cgpa: '',
        approved: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      APP.initUser(cred.user, isAlumni ? 'alumni' : 'student');
      showApp();
      UI.showToast('Welcome, ' + name.split(' ')[0] + '! Account created.');
    } catch (e) {
      _err(errEl, _friendly(e.message));
    } finally {
      btn.innerHTML = 'Create Account';
      btn.classList.remove('loading');
    }
  }

  // ── Forgot Password ──
  async function sendResetEmail() {
    const email = document.getElementById('forgotEmail').value.trim();
    const errEl = document.getElementById('forgotError');
    const btn = document.getElementById('forgotBtn');
    errEl.classList.remove('show');

    if (!email) { _err(errEl, 'Please enter your registered email address.'); return; }
    if (!email.includes('@')) { _err(errEl, 'Please enter your email address (not your USN).'); return; }
    btn.innerHTML = '⏳ Sending…';
    btn.classList.add('loading');
    try {
      await auth.sendPasswordResetEmail(email);
      _forgotEmail = email;
      document.getElementById('forgotStep1').style.display = 'none';
      document.getElementById('forgotStep2').style.display = 'block';
      document.getElementById('forgotSentTo').textContent = email;
    } catch (e) {
      _err(errEl, _friendly(e.message));
    } finally {
      btn.innerHTML = 'Send Reset Link';
      btn.classList.remove('loading');
    }
  }

  async function resendReset() {
    if (!_forgotEmail) return;
    try {
      await auth.sendPasswordResetEmail(_forgotEmail);
      UI.showToast('Reset link resent to ' + _forgotEmail);
    } catch (e) {
      UI.showToast('Could not resend. Try again later.', true);
    }
  }

  // ── Logout ──
  async function logout() {
    if (!confirm('Sign out of MentorMesh?')) return;

    if (typeof CHAT !== 'undefined') CHAT.clearInbox();
    if (typeof EVENTS !== 'undefined') EVENTS.clearEvents();

    await auth.signOut();
    showLogin();
    APP.resetState();
  }

  function switchRole(btn) {
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function _err(el, msg) { el.textContent = msg; el.classList.add('show'); }
  function _friendly(msg) {
    if (typeof msg !== 'string') msg = JSON.stringify(msg || '');
    if (msg.includes('INVALID_LOGIN_CREDENTIALS') || msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential') || msg.includes('INVALID_CREDENTIAL')) {
      return 'Invalid Login Credentials';
    }
    if (msg.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes and try again.';
    if (msg.includes('email-already-in-use')) return 'This email is already registered. Try logging in.';
    if (msg.includes('invalid-email')) return 'Please enter a valid email address.';
    return msg;
  }

  // 🔄 ADJUSTED CALENDAR TIMELINE MATRIX GENERATOR
  function initializeDynamicYearDropdowns() {
    const currentYear = new Date().getFullYear();
    const maxYear = currentYear;
    const baselineYear = 2018;
    let dynamicOptionsHtml = '<option value="">Select Year</option>';

    for (let year = maxYear; year >= baselineYear; year--) {
      dynamicOptionsHtml += `<option value="${year}">${year}</option>`;
    }

    const regYearSelect = document.getElementById('regYear');
    const addYearSelect = document.getElementById('f_year');

    if (regYearSelect) regYearSelect.innerHTML = dynamicOptionsHtml;
    if (addYearSelect) addYearSelect.innerHTML = dynamicOptionsHtml;
  }

  // Bind dropdown initialization to fire up on document ready state
  document.addEventListener('DOMContentLoaded', initializeDynamicYearDropdowns);

  return {
    login, register, logout, showLogin, showRegister, showForgot,
    showApp, switchRole, switchRegType, validateUSN, sendResetEmail, resendReset
  };
})();

// ============================================================
// 🔄 AUTHENTICATION STATE OBSERVER WITH INTEGRATED LISTENERS
// ============================================================
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    user = { uid: 'guest', email: 'guest@college.edu', displayName: 'Guest User' };
  }
  let role = 'student';
  try {
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (adminDoc.exists) {
      role = 'admin';
    } else {
      const alumniDoc = await db.collection('alumni').doc(user.uid).get();
      if (alumniDoc.exists) {
        const aData = alumniDoc.data();
        if (aData.accountType === 'alumni' || (aData.year && String(aData.year).length === 4)) {
          role = 'alumni';
        }
      }
    }
  } catch(err) {
    console.warn('Role resolution error:', err);
  }
  
  APP.initUser(user, role);

  // Automatically mount real-time notification observers on boot
  if (typeof EVENTS !== 'undefined') {
    EVENTS.startEventsListener();
  }

  AUTH.showApp();
});