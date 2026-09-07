// ============================================================
//  APP.JS — main application logic
// ============================================================
const APP = (() => {
  let currentUser  = null;
  let currentRole  = null; // 'admin' | 'student'
  let alumniCache  = [];
  let activeFilter = 'All';
  let activeYear   = 'All';
  let unsubscribe  = null;

  async function initUser(user, role) {
    currentUser = user;
    currentRole = role;

    let accountName = user.displayName || user.email.split('@')[0];

    // Fetch user's individual profile document strictly by user.uid
    if (role !== 'admin') {
      try {
        const alumniDoc = await db.collection('alumni').doc(user.uid).get();
        if (alumniDoc.exists) {
          const aData = alumniDoc.data();
          if (aData.name) accountName = aData.name;
          if (aData.accountType === 'alumni' || (aData.year && String(aData.year).length === 4)) {
            currentRole = 'alumni';
            role = 'alumni';
          } else {
            currentRole = 'student';
            role = 'student';
          }
        }
      } catch(e){
        console.warn('Profile sync init:', e);
      }
    }

    const initials = accountName
      ? accountName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
      : user.email[0].toUpperCase();

    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = accountName.split(' ')[0];
    const initEl = document.getElementById('userInitials');
    if (initEl) initEl.textContent = initials;
    
    let displayRole = 'Student';
    if (role === 'admin') displayRole = 'Coordinator';
    else if (role === 'alumni') displayRole = 'Alumni';

    const roleEl = document.getElementById('userRoleLabel');
    if (roleEl) {
      roleEl.textContent = displayRole;
      roleEl.className = 'role-label ' + role;
    }

    const addNav = document.getElementById('nav-add');
    if (addNav) addNav.style.display = role === 'admin' ? 'flex' : 'none';

    if (typeof EVENTS !== 'undefined') EVENTS.checkEventsVisibility();
    if (typeof OPPORTUNITIES !== 'undefined') {
      OPPORTUNITIES.startListener();
      OPPORTUNITIES.startReferralsListener();
    }
    if (typeof CHAT !== 'undefined') CHAT.initInboxListener();
    startListener();
    UI.showPage('home');
  }

  function resetState() {
    currentUser = null;
    currentRole = null;
    alumniCache = [];
    activeFilter = 'All';
    activeYear = 'All';
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }

    // Clear individual profile DOM and user badges
    const ph = document.getElementById('profileHeader');
    if (ph) ph.innerHTML = '';
    const pb = document.getElementById('profileBody');
    if (pb) pb.innerHTML = '';

    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = '...';
    const initEl = document.getElementById('userInitials');
    if (initEl) initEl.textContent = 'U';
    const roleEl = document.getElementById('userRoleLabel');
    if (roleEl) {
      roleEl.textContent = 'Member';
      roleEl.className = 'role-label';
    }

    // Clear login & registration inputs
    ['loginEmail', 'loginPassword', 'regName', 'regUSN', 'regBranch', 'regEmail', 'regPhone', 'regPassword', 'regConfirm', 'regYear', 'regLinkedin', 'regGithub', 'regStatus', 'regCompany', 'regRole', 'regCity', 'regBio'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    window._fullAlumniCache = [];
    window._alumniAll = [];
  }

  function startListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = db.collection('alumni')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        // Enforce clean object array data parsing from Firestore docs snapshot
        alumniCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 💬 CRITICAL FIX FOR CHAT MODULE PIPELINE: Expose full un-filtered cache array globally
        window._fullAlumniCache = alumniCache;
        window._alumniAll       = alumniCache;
        
        UI.renderYearFilter();
        UI.renderList();
        UI.renderStats();
      }, err => console.error('Listener error:', err));
  }

  async function addAlumni() {
    if (currentRole !== 'admin') return;
    const get = id => document.getElementById(id).value.trim();
    const name   = get('f_name');
    const usn    = get('f_usn').toUpperCase();
    const branch = get('f_branch');
    const year   = get('f_year');

    if (!name || !usn || !branch || !year) {
      UI.showToast('Please fill Name, USN, Branch & Year', true); return;
    }

    const dup = await db.collection('alumni').where('usn', '==', usn).limit(1).get();
    if (!dup.empty) { UI.showToast('USN already exists!', true); return; }

    const btn = document.getElementById('addAlumniBtn');
    btn.innerHTML = 'Saving…';
    btn.classList.add('loading');

    try {
      await db.collection('alumni').add({
        name, usn, branch, year,
        cgpa:     get('f_cgpa'),
        status:   get('f_status'),
        company:  get('f_company'),
        role:     get('f_role'),
        city:     get('f_city'),
        linkedin: get('f_linkedin'),
        github:   get('f_github'),
        email:    get('f_email'),
        phone:    get('f_phone'),
        bio:      get('f_bio'),
        approved: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      ['f_name','f_usn','f_cgpa','f_company','f_role','f_city','f_linkedin','f_github','f_email','f_phone','f_bio'].forEach(id => document.getElementById(id).value = '');
      ['f_branch','f_year','f_status'].forEach(id => document.getElementById(id).value = '');
      UI.showToast('✓ Alumni added to directory!');
      UI.showPage('home');
    } catch (e) {
      UI.showToast('Error: ' + e.message, true);
    } finally {
      btn.innerHTML = '+ Add to Directory';
      btn.classList.remove('loading');
    }
  }

  async function deleteAlumni(id) {
    if (currentRole !== 'admin') return;
    if (!confirm('Permanently remove this alumni from the directory?')) return;
    try {
      await db.collection('alumni').doc(id).delete();
      document.getElementById('modalOverlay').classList.remove('open');
      UI.showToast('Alumni removed.');
    } catch(e) { UI.showToast('Delete failed: ' + e.message, true); }
  }

  async function saveEdit(id, field, value) {
    try {
      await db.collection('alumni').doc(id).update({ [field]: value });
    } catch(e) { console.error(e); }
  }

  function resizeImageToBase64(file, maxWidth = 400, maxHeight = 400) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  async function updateAlumniProfile() {
    const user = currentUser;
    if (!user || currentRole === 'admin') return;
    const btn = document.getElementById('saveProfileBtn');
    
    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const newName = getVal('p_name') || user.displayName || user.email.split('@')[0];
    const newEmail = getVal('p_email');
    const newPhone = getVal('p_phone');
    const newLinkedin = getVal('p_linkedin');
    const newGithub = getVal('p_github');
    const newCompany = getVal('p_company');
    const newRole = getVal('p_role');
    const newStatus = document.getElementById('p_status') ? document.getElementById('p_status').value : 'Studying';
    const newCity = getVal('p_city');
    const newBio = getVal('p_bio');
    const newCgpa = getVal('p_cgpa');
    const imageInput = document.getElementById('p_avatarFile');

    if (!newEmail) {
      UI.showToast('Email address field cannot be left blank.', true);
      return;
    }

    if (newCgpa && (parseFloat(newCgpa) < 0 || parseFloat(newCgpa) > 10)) {
      UI.showToast('Invalid CGPA score. Value must rest cleanly between 0.00 and 10.00.', true);
      return;
    }

    btn.innerHTML = 'Saving Updates...';
    btn.classList.add('loading');

    const updateData = {
      name: newName,
      email: newEmail,
      phone: newPhone,
      linkedin: newLinkedin,
      github: newGithub,
      company: newCompany,
      role: newRole,
      status: newStatus,
      city: newCity,
      bio: newBio,
      cgpa: newCgpa,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (imageInput && imageInput.files && imageInput.files[0]) {
        const file = imageInput.files[0];
        const MAX_SIZE = 150 * 1024 * 1024; // 150MB limit
        if (file.size > MAX_SIZE) {
          UI.showToast('Selected image exceeds the 150MB size limit.', true);
          return;
        }
        const base64 = await resizeImageToBase64(file, 400, 400);
        updateData.avatarUrl = base64;
      }

      if (newEmail.toLowerCase() !== user.email.toLowerCase()) {
        try {
          await user.updateEmail(newEmail);
        } catch (authError) {
          if (authError.code === 'auth/requires-recent-login') {
            throw new Error('For security reasons, changing your primary email requires a fresh sign-in. Please log out and log back in, then try again.');
          }
          throw authError;
        }
      }

      if (newName && newName !== user.displayName) {
        try {
          await user.updateProfile({ displayName: newName });
        } catch(e){}
      }

      // STRICT ISOLATION: Save ONLY to this specific authenticated user's UID document
      await db.collection('alumni').doc(user.uid).set(updateData, { merge: true });

      // Update in-memory session and topbar display
      const nameEl = document.getElementById('userName');
      if (nameEl) nameEl.textContent = newName.split(' ')[0];
      const initEl = document.getElementById('userInitials');
      if (initEl) initEl.textContent = newName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

      UI.showToast('✓ Profile successfully updated!');
      UI.renderProfile();
    } catch (error) {
      console.error("Profile save error:", error);
      UI.showToast(error.message, true);
    } finally {
      btn.innerHTML = '💾 Save Profile Changes';
      btn.classList.remove('loading');
    }
  }

  function getFiltered() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
    return alumniCache.filter(a => {
      const matchBranch = activeFilter === 'All' || a.branch === activeFilter;
      const matchYear   = activeYear   === 'All' || a.year   === activeYear;
      const matchSearch = !q || [a.name, a.company, a.role, a.city, a.usn, a.branch].some(x => (x || '').toLowerCase().includes(q));
      return matchBranch && matchYear && matchSearch;
    });
  }

  function setFilter(branch) { activeFilter = branch; }
  function setYear(year)    { activeYear   = year; }
  function getRole()         { return currentRole; }
  function getUser()         { return currentUser; }

  function validateAvatarFile(input) {
    if (input && input.files && input.files[0]) {
      const file = input.files[0];
      const MAX_SIZE = 150 * 1024 * 1024; // 150MB
      if (file.size > MAX_SIZE) {
        UI.showToast('⚠️ Selected file exceeds the 150 MB maximum upload limit.', true);
        input.value = '';
        return false;
      }
    }
    return true;
  }

  return {
    initUser, resetState, addAlumni, deleteAlumni, saveEdit,
    getFiltered, setFilter, setYear, getRole, getUser,
    updateAlumniProfile, validateAvatarFile
  };
})();

// ============================================================
//  UI.JS — rendering helpers
// ============================================================
const UI = (() => {
  const COLORS  = ['#7c6af7','#f4b942','#34d399','#f87171','#60a5fa','#fb923c','#a78bfa','#4ade80'];
  const AVATARBG= ['#2d2255','#4a3700','#0f3025','#4a1515','#0c2a4a','#4a2200','#2a1a55','#0a3a18'];

  function colorFor(str) {
    let h = 0;
    for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return { bg: AVATARBG[h % AVATARBG.length], fg: COLORS[h % COLORS.length] };
  }

  function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // ============================================================
  // 🔄 FIXED COORDINATOR INTERFACE ROUTER MATRIX
  // ============================================================
  // ============================================================
  // 🔄 FIXED COORDINATOR INTERFACE ROUTER MATRIX
  // ============================================================
  // ============================================================
  // 🔄 UNIFIED INTERFACE ROUTER STATE MACHINE
  // ============================================================
  function showPage(p) {
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pg = document.getElementById('page-' + p);
    const nv = document.getElementById('nav-' + p);
    
    if (pg) pg.classList.add('active');
    if (nv) nv.classList.add('active');
    
    // ── SYSTEM LIFECYCLE HOOK ROUTING ──
    if (p === 'profile') renderProfile();
    if (p === 'settings') {
      if (typeof SETTINGS !== 'undefined') SETTINGS.initSettingsView();
    }
    if (p === 'inbox') {
      if (typeof CHAT !== 'undefined') {
        CHAT.initInboxListener();
        CHAT.renderInboxList();
      }
    }
    
    // 🆕 UNLOCKED COLLEGE EVENTS NAVIGATION ROUTE
    if (p === 'events') {
      // 1. CLEAR RED DOT NOTIFICATION ON CLICK
      const badge = document.getElementById('globalEventsBadge');
      if (badge) badge.style.setProperty('display', 'none', 'important');
      
      // 2. Directs the background snapshot observer stream to wake up
      if (typeof EVENTS !== 'undefined') EVENTS.startEventsListener();
      
      // 3. Selectively toggle the visibility of the floating creation button based on admin clearance
      const actionBtn = document.getElementById('adminCreateEventBtn');
      const userRole = APP.getRole(); 
      
      if (actionBtn) {
        if (userRole === 'admin') {
          actionBtn.style.setProperty('display', 'flex', 'important');
          
          // Bulletproof direct event trigger override
          actionBtn.onclick = function() {
            const modal = document.getElementById('eventModalOverlay');
            if (modal) modal.classList.add('open');
          };
        } else {
          actionBtn.style.setProperty('display', 'none', 'important');
        }
      }
    }

    // 🆕 UNLOCKED OPPORTUNITIES HUB NAVIGATION ROUTE
    if (p === 'opps') {
      if (typeof OPPORTUNITIES !== 'undefined') {
        OPPORTUNITIES.startListener();
        OPPORTUNITIES.startReferralsListener();
        OPPORTUNITIES.renderList();
      }

      const oppBtn = document.getElementById('adminCreateOppBtn');
      const alumniBtn = document.getElementById('alumniShareOppBtn');
      const alumniBanner = document.getElementById('alumniShareBanner');
      const referralsTab = document.getElementById('adminReferralsTab');
      const myReferralsTab = document.getElementById('myReferralsTab');
      const userRole = APP.getRole();

      if (oppBtn) {
        oppBtn.style.setProperty('display', userRole === 'admin' ? 'flex' : 'none', 'important');
        if (userRole === 'admin') {
          oppBtn.onclick = function() { OPPORTUNITIES.openCreateModal(); };
        }
      }

      if (alumniBtn) alumniBtn.style.display = userRole === 'alumni' ? 'inline-flex' : 'none';
      if (alumniBanner) alumniBanner.style.display = userRole === 'alumni' ? 'flex' : 'none';
      if (referralsTab) referralsTab.style.display = userRole === 'admin' ? 'flex' : 'none';
      if (myReferralsTab) myReferralsTab.style.display = userRole === 'alumni' ? 'flex' : 'none';
    }

    if (p === 'inbox') {
      const alumniChatBanner = document.getElementById('alumniCoordinatorChatBanner');
      const userRole = APP.getRole();
      if (alumniChatBanner) {
        alumniChatBanner.style.display = userRole === 'alumni' ? 'flex' : 'none';
      }
    }
  }

  function _renderYearFilter(alumniAll) {
    const years = ['All', ...new Set(alumniAll.map(a => a.year).filter(Boolean).sort((a,b) => b - a))];
    const el = document.getElementById('yearFilter');
    if (!el) return;
    const activeY = window._activeYear || 'All';
    el.innerHTML = years.map(y => `
      <div class="year-btn ${y === activeY ? 'active' : ''}" onclick="UI.filterByYear('${y}', this)">
        ${y === 'All' ? 'All Years' : y}
      </div>
    `).join('');
  }

  function renderYearFilter() { _renderYearFilter(window._alumniAll || []); }

  function filterByBranch(branch, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    APP.setFilter(branch);
    renderList();
  }

  function filterByYear(year, el) {
    window._activeYear = year;
    document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    APP.setYear(year);
    renderList();
  }

  function renderList() {
    const list = APP.getFiltered();
    window._alumniAll = list;
    const el = document.getElementById('alumniList');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = `<div class="empty">🎓 No alumni found. Try a different filter.</div>`;
      return;
    }

    el.innerHTML = list.map(a => {
      const { bg, fg } = colorFor(a.name || '?');
      const avatarHeader = a.avatarUrl
        ? `<img src="${a.avatarUrl}" class="avatar" style="object-fit: cover;" onerror="this.onerror=null; this.outerHTML='<div class=\'avatar\' style=\'background:${bg};color:${fg}\'>${initials(a.name)}</div>';">`
        : `<div class="avatar" style="background:${bg};color:${fg}">${initials(a.name)}</div>`;

      return `
        <div class="alumni-card" onclick="UI.openModal('${a.id}')">
          ${a.status ? `<span class="badge ${a.status === 'Employed' ? 'badge-employed' : a.status === 'Studying' ? 'badge-studying' : a.status === 'Entrepreneur' ? 'badge-entrepreneur' : 'badge-freelancer'}">${a.status}</span>` : ''}
          <div class="card-header">
            ${avatarHeader}
            <div class="card-info">
              <h3>${a.name || '—'}</h3>
              <p>${a.branch || '—'} · Class of ${a.year || '—'}</p>
            </div>
          </div>
          <div class="card-details">
            <div class="detail-item"><label>Company</label><span>${a.company || '—'}</span></div>
            <div class="detail-item"><label>Role</label><span>${a.role || '—'}</span></div>
            <div class="detail-item"><label>City</label><span>${a.city || '—'}</span></div>
            <div class="detail-item"><label>CGPA</label><span>${a.cgpa || '—'}</span></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function openModal(id) {
    const a = (window._fullAlumniCache || []).find(x => x.id === id);
    if (!a) return;
    const { bg, fg } = colorFor(a.name || '?');
    const isAdmin = APP.getRole() === 'admin';

    const avatarHeader = a.avatarUrl
      ? `<img src="${a.avatarUrl}" class="profile-avatar" style="object-fit: cover; width:80px; height:80px; border-radius:50%; border:3px solid var(--accent);" onerror="this.onerror=null; this.outerHTML='<div class=\'profile-avatar\'>${initials(a.name)}</div>';">`
      : `<div class="profile-avatar" style="background:${bg};color:${fg}; margin:0 auto 14px;">${initials(a.name)}</div>`;

    const rows = [
      ['USN / Roll No', a.usn],
      ['Branch', a.branch],
      ['Year of Passing', a.year],
      ['CGPA', a.cgpa],
      ['Current Status', a.status],
      ['Company / University', a.company],
      ['Role / Course', a.role],
      ['City', a.city],
      ['Email', a.email],
      ['Phone', a.phone],
    ].filter(r => r[1]).map(r => `
      <div class="info-row">
        <span class="key">${r[0]}</span>
        <span class="val">${r[1]}</span>
      </div>
    `).join('');

    document.getElementById('modalBody').innerHTML = `
      <div class="profile-header">
        ${avatarHeader}
        <h2>${a.name}</h2>
        <p>${a.branch} · Class of ${a.year}</p>
      </div>
      ${a.bio ? `<p style="text-align:center; font-style:italic; margin-bottom:16px; color:var(--muted)">"${a.bio}"</p>` : ''}
      <div class="profile-section">${rows}</div>
      
      ${a.linkedin ? `<a href="${a.linkedin.startsWith('http') ? a.linkedin : 'https://' + a.linkedin}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:block; text-align:center; margin-top:10px; text-decoration:none;">🔗 LinkedIn Profile</a>` : ''}
      ${a.github ? `<a href="${a.github.startsWith('http') ? a.github : 'https://' + a.github}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="display:block; text-align:center; margin-top:8px; text-decoration:none; border-color:var(--border); color:var(--text); font-weight:600;">🐙 GitHub Profile</a>` : ''}
      
      <button class="btn-secondary" style="display:block; text-align:center; margin-top:10px; width:100%; border-color:var(--accent);" onclick="CHAT.openBox('${a.id}', '${a.name}')">
        💬 Send Direct Message
      </button>

      ${isAdmin ? `<button class="btn-danger" onclick="APP.deleteAlumni('${a.id}')">🗑 Remove from Directory</button>` : ''}
    `;
    document.getElementById('modalOverlay').classList.add('open');
  }

  function closeModal(e) {
    if (e.target === document.getElementById('modalOverlay'))
      document.getElementById('modalOverlay').classList.remove('open');
  }

  function renderStats() {
    const all = window._fullAlumniCache || [];
    const total = all.length;
    const employed = all.filter(a => a.status === 'Employed').length;
    const studying = all.filter(a => a.status === 'Studying').length;
    const ent = all.filter(a => a.status === 'Entrepreneur').length;

    const sg = document.getElementById('statsGrid');
    if (sg) {
      sg.innerHTML = `
        <div class="stat-card"><div class="num">${total}</div><div class="lbl">Total Alumni</div></div>
        <div class="stat-card"><div class="num">${employed}</div><div class="lbl">Employed</div></div>
        <div class="stat-card"><div class="num">${studying}</div><div class="lbl">Studying</div></div>
        <div class="stat-card"><div class="num">${ent}</div><div class="lbl">Entrepreneurs</div></div>
      `;
    }

    const branches = {};
    all.forEach(a => { if(a.branch) branches[a.branch] = (branches[a.branch]||0)+1; });
    const bb = document.getElementById('branchBreakdown');
    if (bb) {
      bb.innerHTML = Object.entries(branches).sort((a,b)=>b[1]-a[1]).map(([b,c]) => `
        <div class="bar-row">
          <div class="bar-label"><span>${b}</span><span>${c}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(c/total)*100}%; background:var(--accent);"></div></div>
        </div>
      `).join('');
    }

    const years = {};
    all.forEach(a => { if(a.year) years[a.year] = (years[a.year]||0)+1; });
    const yb = document.getElementById('yearBreakdown');
    if (yb) {
      yb.innerHTML = Object.entries(years).sort((a,b)=>b[0]-a[0]).map(([y,c]) => `
        <div class="bar-row">
          <div class="bar-label"><span>Class of ${y}</span><span>${c}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(c/total)*100}%; background:var(--gold);"></div></div>
        </div>
      `).join('');
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }

  async function renderProfile() {
    const user = APP.getUser();
    if (!user) return;
    const role = APP.getRole();
    const ph = document.getElementById('profileHeader');
    const pb = document.getElementById('profileBody');
    if (!ph || !pb) return;

    if (role === 'admin') {
      ph.innerHTML = `
        <div class="profile-avatar">${user.displayName ? user.displayName[0].toUpperCase() : 'A'}</div>
        <h2>${escapeHtml(user.displayName || 'Coordinator')}</h2>
        <p>College Placement Coordinator / Administrator</p>
      `;
      pb.innerHTML = `
        <div class="profile-section">
          <h3>Administrator Credentials</h3>
          <div class="info-row"><span class="key">Coordinator Name</span><span class="val">${escapeHtml(user.displayName || 'Coordinator')}</span></div>
          <div class="info-row"><span class="key">Official Email</span><span class="val">${escapeHtml(user.email)}</span></div>
          <div class="info-row"><span class="key">Clearance Level</span><span class="val" style="color:var(--gold); font-weight:700;">Full Administrative Access</span></div>
        </div>
      `;
      return;
    }

    // STRICT ISOLATION: Fetch strictly by authenticated user's own UID
    let a = null;
    try {
      const doc = await db.collection('alumni').doc(user.uid).get();
      if (doc.exists) {
        a = { id: doc.id, ...doc.data() };
      }
    } catch(err) {
      console.warn("Profile fetch error:", err);
    }

    if (!a) {
      // Create fresh independent profile strictly for this user's UID
      a = {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        branch: 'CSE',
        year: '',
        usn: '',
        accountType: role === 'alumni' ? 'alumni' : 'student',
        status: 'Studying',
        company: '',
        role: '',
        city: '',
        linkedin: '',
        github: '',
        phone: '',
        bio: '',
        cgpa: '',
        avatarUrl: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        await db.collection('alumni').doc(user.uid).set(a);
      } catch (createErr) {
        console.warn('Initial profile doc creation:', createErr);
      }
    }

    const { bg, fg } = colorFor(a.name || '?');
    const avatarHeader = a.avatarUrl
      ? `<img src="${a.avatarUrl}" class="profile-avatar" style="object-fit: cover;" onerror="this.onerror=null; this.outerHTML='<div class=\\'profile-avatar\\'>${initials(a.name)}</div>';">`
      : `<div class="profile-avatar" style="background:${bg};color:${fg}">${initials(a.name)}</div>`;

    const roleBadgeText = a.accountType === 'alumni' ? 'Alumni Member' : 'Student';
    const subline = `${a.branch || 'CSE'} ${a.year ? '· Class of ' + a.year : ''} · ${roleBadgeText}`;

    ph.innerHTML = `
      ${avatarHeader}
      <h2>${escapeHtml(a.name || 'Member')}</h2>
      <p>${escapeHtml(subline)}</p>
    `;

    pb.innerHTML = `
      <div class="profile-section">
        <h3>Academic Credentials (Registered)</h3>
        <div class="info-row"><span class="key">USN / Roll No</span><span class="val">${escapeHtml(a.usn || '—')}</span></div>
        <div class="info-row"><span class="key">Branch</span><span class="val">${escapeHtml(a.branch || '—')}</span></div>
        <div class="info-row"><span class="key">Graduation Year</span><span class="val">${escapeHtml(a.year || '—')}</span></div>
        <div class="info-row"><span class="key">Account Classification</span><span class="val" style="color:var(--accent2); font-weight:600;">${roleBadgeText}</span></div>
      </div>

      <div class="profile-section">
        <h3>Profile Picture</h3>
        <div class="field">
          <label>Upload From Gallery</label>
          <input type="file" id="p_avatarFile" accept="image/*" onchange="APP.validateAvatarFile(this)" style="padding:8px 0;">
          <div style="font-size:12px; margin-top:5px; color:var(--muted); line-height:1.4;">
            Photos are saved privately to your account profile.
          </div>
        </div>
      </div>

      <div class="profile-section">
        <h3>Personal, Career & Contact Details</h3>
        <div class="field">
          <label>Full Name</label>
          <input id="p_name" value="${escapeHtml(a.name || '')}" placeholder="Your full name">
        </div>
        <div class="field">
          <label>Current Status</label>
          <select id="p_status">
            <option value="Employed" ${a.status === 'Employed' ? 'selected' : ''}>Employed</option>
            <option value="Studying" ${a.status === 'Studying' ? 'selected' : ''}>Studying</option>
            <option value="Entrepreneur" ${a.status === 'Entrepreneur' ? 'selected' : ''}>Entrepreneur</option>
            <option value="Freelancer" ${a.status === 'Freelancer' ? 'selected' : ''}>Freelancer</option>
          </select>
        </div>
        <div class="field"><label>Company / Organization / University</label><input id="p_company" value="${escapeHtml(a.company || '')}" placeholder="e.g. Google or University"></div>
        <div class="field"><label>Job Title / Role / Course</label><input id="p_role" value="${escapeHtml(a.role || '')}" placeholder="e.g. Software Engineer"></div>
        <div class="field"><label>City / Location</label><input id="p_city" value="${escapeHtml(a.city || '')}" placeholder="e.g. Bengaluru, India"></div>
        
        <div class="field">
          <label>Cumulative GPA (CGPA)</label>
          <input id="p_cgpa" type="number" step="0.01" min="0" max="10" placeholder="e.g. 8.75" value="${escapeHtml(a.cgpa || '')}">
        </div>

        <div class="field"><label>LinkedIn Profile URL</label><input id="p_linkedin" placeholder="https://linkedin.com/in/…" value="${escapeHtml(a.linkedin || '')}"></div>
        <div class="field"><label>GitHub Profile URL</label><input id="p_github" placeholder="https://github.com/…" value="${escapeHtml(a.github || '')}"></div>
        <div class="field"><label>Email Address *</label><input id="p_email" value="${escapeHtml(a.email || user.email || '')}"></div>
        <div class="field"><label>Phone Number</label><input id="p_phone" value="${escapeHtml(a.phone || '')}" placeholder="+91 ..."></div>
        <div class="field"><label>Short Bio / About Me</label><textarea id="p_bio" placeholder="Share a few words about your background, interests or goals...">${escapeHtml(a.bio || '')}</textarea></div>
        <button class="btn-primary" id="saveProfileBtn" onclick="APP.updateAlumniProfile()">💾 Save Profile Changes</button>
      </div>
    `;
  }

  function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  return {
    showPage, filterByBranch, filterByYear, renderList,
    renderYearFilter, renderStats, openModal, closeModal,
    renderProfile, showToast
  };
})();

// Keep global sync cache fully mapped to array records for chat.js lookups
function _syncCache(docs) {
  window._fullAlumniCache = docs;
  window._alumniAll       = docs;
  UI.renderYearFilter();
  UI.renderList();
  UI.renderStats();
}