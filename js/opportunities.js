// ============================================================
//  OPPORTUNITIES.JS — Internships & Job Vacancies Engine
//  Includes Exclusive Alumni-to-Coordinator Opportunity Referral
// ============================================================
const OPPORTUNITIES = (() => {
  let oppsUnsubscribe = null;
  let referralsUnsubscribe = null;
  let allOpportunities = [];
  let allReferrals = [];
  let activeTab = 'All'; // 'All' | 'Internship' | 'Job' | 'Referrals' | 'MyReferrals'
  let searchQuery = '';
  let editingId = null;

  // Helper: Format date string (YYYY-MM-DD) into readable text
  function formatDate(dateStr) {
    if (!dateStr) return 'No deadline set';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      }
      return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  // Calculate deadline status and countdown
  function getDeadlineInfo(deadlineDateStr) {
    if (!deadlineDateStr) return { expired: false, label: 'Open', className: 'deadline-open' };
    
    const parts = deadlineDateStr.split('-');
    let deadline;
    if (parts.length === 3) {
      deadline = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59);
    } else {
      deadline = new Date(deadlineDateStr + 'T23:59:59');
    }
    
    const now = new Date();
    const diffMs = deadline - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) {
      return { expired: true, label: 'Expired', className: 'deadline-expired' };
    } else if (diffDays <= 1) {
      return { expired: false, label: '⚠️ Last Day to Apply!', className: 'deadline-urgent' };
    } else if (diffDays <= 3) {
      return { expired: false, label: `⏳ ${diffDays} days left`, className: 'deadline-warning' };
    } else {
      return { expired: false, label: `📅 Ends ${formatDate(deadlineDateStr)}`, className: 'deadline-normal' };
    }
  }

  // 1. Real-time background listener for Public Opportunities
  function startListener() {
    if (oppsUnsubscribe) oppsUnsubscribe();

    const container = document.getElementById('oppsList');
    if (container && allOpportunities.length === 0 && activeTab !== 'Referrals' && activeTab !== 'MyReferrals') {
      container.innerHTML = '<div class="empty"><div class="icon">⏳</div><p>Loading opportunities…</p></div>';
    }

    oppsUnsubscribe = db.collection('opportunities')
      .orderBy('createdAt', 'desc')
      .onSnapshot((snap) => {
        const rawDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const validDocs = [];
        const expiredIds = [];

        rawDocs.forEach(item => {
          if (item.deadlineDate) {
            const deadlineInfo = getDeadlineInfo(item.deadlineDate);
            if (deadlineInfo.expired) {
              expiredIds.push(item.id);
            } else {
              validDocs.push(item);
            }
          } else {
            validDocs.push(item);
          }
        });

        // Purge expired listings
        if (expiredIds.length > 0) {
          expiredIds.forEach(id => {
            db.collection('opportunities').doc(id).delete()
              .then(() => console.log(`Auto-purged expired opportunity: ${id}`))
              .catch(err => console.warn(`Auto-purge skipped: ${err.message}`));
          });
        }

        allOpportunities = validDocs;
        renderList();
        updateOppsBadge();
      }, err => {
        console.error('Opportunities listener error:', err);
        if (container && activeTab !== 'Referrals' && activeTab !== 'MyReferrals') {
          container.innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>Unable to load opportunities.</p></div>';
        }
      });
  }

  // 2. Real-time background listener for Alumni Referrals / Submissions
  function startReferralsListener() {
    if (referralsUnsubscribe) referralsUnsubscribe();

    try {
      referralsUnsubscribe = db.collection('alumni_shared_opportunities')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
          allReferrals = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          updateReferralsBadge();
          if (activeTab === 'Referrals' || activeTab === 'MyReferrals') {
            renderList();
          }
        }, err => {
          console.warn('Referrals listener error:', err);
        });
    } catch (e) {
      console.warn('Could not mount referrals listener:', e);
    }
  }

  function updateReferralsBadge() {
    const badge = document.getElementById('oppsReferralBadge');
    if (!badge) return;
    const pendingCount = allReferrals.filter(r => (r.status || 'pending') === 'pending').length;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function updateOppsBadge() {
    const badge = document.getElementById('globalOppsBadge');
    if (!badge) return;
    if (allOpportunities.length > 0) {
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  // 3. Filter & Search handlers
  function setTab(tab, el) {
    activeTab = tab;
    document.querySelectorAll('#oppsTabs .tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    renderList();
  }

  function onSearch(query) {
    searchQuery = (query || '').toLowerCase().trim();
    renderList();
  }

  function getFilteredOpportunities() {
    return allOpportunities.filter(item => {
      if (activeTab === 'Internship' && item.type !== 'Internship') return false;
      if (activeTab === 'Job' && item.type !== 'Job' && item.type !== 'Full-time Job' && item.type !== 'Job Vacancy') return false;

      if (searchQuery) {
        const titleMatch = (item.title || '').toLowerCase().includes(searchQuery);
        const companyMatch = (item.company || '').toLowerCase().includes(searchQuery);
        const locationMatch = (item.location || '').toLowerCase().includes(searchQuery);
        const skillsMatch = (item.skills || '').toLowerCase().includes(searchQuery);
        const eligibilityMatch = (item.eligibility || '').toLowerCase().includes(searchQuery);
        const descMatch = (item.description || '').toLowerCase().includes(searchQuery);
        if (!titleMatch && !companyMatch && !locationMatch && !skillsMatch && !eligibilityMatch && !descMatch) {
          return false;
        }
      }

      return true;
    });
  }

  // 4. UI Renderer
  function renderList() {
    const container = document.getElementById('oppsList');
    if (!container) return;

    const userRole = APP.getRole();
    const isAdmin = userRole === 'admin';
    const isAlumni = userRole === 'alumni';
    const currentUser = APP.getUser();

    // Toggle header button visibility
    const createBtn = document.getElementById('adminCreateOppBtn');
    if (createBtn) createBtn.style.display = isAdmin ? 'flex' : 'none';

    const alumniBtn = document.getElementById('alumniShareOppBtn');
    if (alumniBtn) alumniBtn.style.display = isAlumni ? 'inline-flex' : 'none';

    const alumniBanner = document.getElementById('alumniShareBanner');
    if (alumniBanner) alumniBanner.style.display = isAlumni ? 'flex' : 'none';

    const referralsTab = document.getElementById('adminReferralsTab');
    if (referralsTab) referralsTab.style.display = isAdmin ? 'flex' : 'none';

    const myReferralsTab = document.getElementById('myReferralsTab');
    if (myReferralsTab) myReferralsTab.style.display = isAlumni ? 'flex' : 'none';

    // ── RENDER ALUMNI REFERRALS FOR COORDINATOR ──
    if (activeTab === 'Referrals') {
      renderCoordinatorReferrals(container);
      return;
    }

    // ── RENDER MY SHARED REFERRALS FOR ALUMNI ──
    if (activeTab === 'MyReferrals') {
      renderMyAlumniReferrals(container, currentUser);
      return;
    }

    // ── RENDER PUBLIC OPPORTUNITIES HUB ──
    const items = getFilteredOpportunities();

    if (items.length === 0) {
      const emptyMsg = searchQuery || activeTab !== 'All'
        ? 'No vacancies found matching your filters.'
        : 'No active job or internship vacancies at the moment.';
      container.innerHTML = `
        <div class="empty">
          <div class="icon">💼</div>
          <p>${emptyMsg}</p>
          ${isAdmin ? '<button class="btn-primary" style="margin-top:14px; width:auto; padding:8px 20px;" onclick="OPPORTUNITIES.openCreateModal()">+ Post First Opportunity</button>' : ''}
          ${isAlumni ? '<button class="btn-primary" style="margin-top:14px; width:auto; padding:8px 20px;" onclick="OPPORTUNITIES.openAlumniShareModal()">💼 Share Vacancy with Coordinator</button>' : ''}
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const isInternship = item.type === 'Internship';
      const badgeClass = isInternship ? 'badge-internship' : 'badge-job';
      const typeIcon = isInternship ? '🎓' : '💼';
      const typeLabel = isInternship ? 'Internship' : 'Job Vacancy';
      const deadline = getDeadlineInfo(item.deadlineDate);

      const skillsArray = (item.skills || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const skillsHtml = skillsArray.length > 0
        ? `<div class="opp-skills-list">${skillsArray.slice(0, 4).map(s => `<span class="opp-skill-tag">${escapeHtml(s)}</span>`).join('')}${skillsArray.length > 4 ? `<span class="opp-skill-tag">+${skillsArray.length - 4}</span>` : ''}</div>`
        : '';

      const adminActions = isAdmin ? `
        <div class="opp-admin-actions">
          <button class="btn-opp-edit" onclick="event.stopPropagation(); OPPORTUNITIES.openEditModal('${item.id}')">✏️ Edit</button>
          <button class="btn-opp-delete" onclick="event.stopPropagation(); OPPORTUNITIES.deleteOpportunity('${item.id}')">🗑️ Delete</button>
        </div>
      ` : '';

      const applyUrl = item.applyUrl ? (item.applyUrl.startsWith('http') || item.applyUrl.startsWith('mailto:') ? item.applyUrl : 'https://' + item.applyUrl) : '#';

      return `
        <div class="opp-card" onclick="OPPORTUNITIES.openDetailModal('${item.id}')">
          <div class="opp-card-top">
            <div class="opp-company-meta">
              <div class="opp-company-avatar">${escapeHtml((item.company || 'Co').slice(0, 2).toUpperCase())}</div>
              <div>
                <h3 class="opp-title">${escapeHtml(item.title || 'Untitled Opportunity')}</h3>
                <p class="opp-company">${escapeHtml(item.company || 'Company')} ${item.location ? `· <span class="opp-location">📍 ${escapeHtml(item.location)}</span>` : ''}</p>
              </div>
            </div>
            <span class="opp-type-badge ${badgeClass}">${typeIcon} ${escapeHtml(typeLabel)}</span>
          </div>

          <div class="opp-highlight-row">
            ${item.stipendOrSalary ? `<div class="opp-highlight-chip">💰 <b>${escapeHtml(item.stipendOrSalary)}</b></div>` : ''}
            ${item.eligibility ? `<div class="opp-highlight-chip">🎯 ${escapeHtml(item.eligibility)}</div>` : ''}
            <div class="opp-highlight-chip ${deadline.className}">${deadline.label}</div>
          </div>

          ${item.description ? `<p class="opp-description">${escapeHtml(item.description.slice(0, 140))}${item.description.length > 140 ? '…' : ''}</p>` : ''}

          ${skillsHtml}

          <div class="opp-footer">
            <a href="${applyUrl}" target="_blank" rel="noopener noreferrer" class="btn-apply" onclick="event.stopPropagation();">
              Apply Now <span>↗</span>
            </a>
            ${adminActions}
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Render Alumni Referrals for Coordinator
  function renderCoordinatorReferrals(container) {
    if (allReferrals.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="icon">📥</div>
          <p>No alumni referrals received yet.</p>
          <p style="font-size:12px; color:var(--muted); margin-top:4px;">When verified alumni submit job vacancies or internship leads, they will appear here for your review and 1-click publishing.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="background:rgba(244,185,66,0.08); border:1px solid rgba(244,185,66,0.25); border-radius:var(--radius-sm); padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:var(--gold); font-size:14px;">📥 Alumni Referrals Review Desk</strong>
          <p style="font-size:12px; color:var(--muted); margin:2px 0 0;">Review leads shared by alumni and publish them to students in 1 click.</p>
        </div>
        <span style="background:var(--gold); color:#111; font-weight:700; font-size:12px; padding:3px 10px; border-radius:12px;">${allReferrals.length} Total</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${allReferrals.map(ref => {
          const status = ref.status || 'pending';
          const isPending = status === 'pending';
          const isApproved = status === 'approved';
          const badgeClass = isPending ? 'referral-status-pending' : (isApproved ? 'referral-status-approved' : 'referral-status-rejected');
          const statusLabel = isPending ? '⏳ Pending Review' : (isApproved ? '✅ Published Live' : '❌ Dismissed');
          const isInternship = ref.type === 'Internship';

          return `
            <div class="opp-card" style="border-left: 4px solid ${isPending ? 'var(--gold)' : (isApproved ? 'var(--green)' : 'var(--red)')};" onclick="OPPORTUNITIES.openReferralDetailModal('${ref.id}')">
              <div class="opp-card-top">
                <div class="opp-company-meta">
                  <div class="opp-company-avatar" style="background:linear-gradient(135deg, rgba(244,185,66,0.3) 0%, rgba(244,185,66,0.1) 100%); color:var(--gold); border-color:rgba(244,185,66,0.3);">${escapeHtml((ref.company || 'Co').slice(0, 2).toUpperCase())}</div>
                  <div>
                    <h3 class="opp-title">${escapeHtml(ref.title || 'Untitled')}</h3>
                    <p class="opp-company">${escapeHtml(ref.company || '')} · <span class="opp-location">📍 ${escapeHtml(ref.location || 'Not specified')}</span></p>
                  </div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                  <span class="referral-status-badge ${badgeClass}">${statusLabel}</span>
                  <span class="opp-type-badge ${isInternship ? 'badge-internship' : 'badge-job'}" style="font-size:11px;">${isInternship ? '🎓 Internship' : '💼 Job Vacancy'}</span>
                </div>
              </div>

              <div style="background:var(--surface2); padding:10px 12px; border-radius:var(--radius-xs); border:1px solid var(--border); margin:4px 0;">
                <div style="font-size:12px; color:var(--accent2); font-weight:600; margin-bottom:2px;">
                  👤 Shared by Alumni: ${escapeHtml(ref.alumniName || 'Alumni')} ${ref.alumniCompany ? `(${escapeHtml(ref.alumniRole || '')} @ ${escapeHtml(ref.alumniCompany)})` : ''}
                </div>
                ${ref.notesForCoordinator ? `<p style="font-size:12px; color:var(--text); margin:4px 0 0; font-style:italic;">💬 "${escapeHtml(ref.notesForCoordinator)}"</p>` : ''}
              </div>

              <div class="opp-highlight-row">
                ${ref.stipendOrSalary ? `<div class="opp-highlight-chip">💰 ${escapeHtml(ref.stipendOrSalary)}</div>` : ''}
                ${ref.deadlineDate ? `<div class="opp-highlight-chip">⏰ Deadline: ${formatDate(ref.deadlineDate)}</div>` : ''}
              </div>

              <div class="opp-footer" style="margin-top:6px;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${isPending ? `
                    <button class="btn-primary" style="padding:7px 14px; font-size:12px; width:auto; margin:0;" onclick="event.stopPropagation(); OPPORTUNITIES.approveReferral('${ref.id}')">🚀 Approve & Post Live</button>
                  ` : ''}
                  <button class="btn-secondary" style="padding:7px 14px; font-size:12px; width:auto; margin:0;" onclick="event.stopPropagation(); OPPORTUNITIES.chatWithAlumni('${ref.alumniUid || ''}', '${escapeHtml(ref.alumniName || 'Alumni').replace(/'/g, "\\'")}')">💬 Chat with Alumni</button>
                  <button class="btn-danger" style="padding:7px 14px; font-size:12px; width:auto; margin:0;" onclick="event.stopPropagation(); OPPORTUNITIES.deleteReferral('${ref.id}')">🗑️ Remove</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // 6. Render My Referrals for Alumni
  function renderMyAlumniReferrals(container, currentUser) {
    const currentUid = currentUser ? currentUser.uid : '';
    const myRefs = allReferrals.filter(r => r.alumniUid === currentUid || r.submittedByUid === currentUid);

    if (myRefs.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="icon">💼</div>
          <p>You haven't shared any job vacancies or internship leads yet.</p>
          <button class="btn-primary" style="margin-top:14px; width:auto; padding:8px 20px;" onclick="OPPORTUNITIES.openAlumniShareModal()">+ Share Opportunity with Coordinator</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <span style="font-size:14px; font-weight:600; color:var(--text);">My Shared Opportunities (${myRefs.length})</span>
        <button class="btn-primary" style="width:auto; padding:6px 14px; font-size:12px; margin:0;" onclick="OPPORTUNITIES.openAlumniShareModal()">+ Share Another</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${myRefs.map(ref => {
          const status = ref.status || 'pending';
          const isPending = status === 'pending';
          const isApproved = status === 'approved';
          const badgeClass = isPending ? 'referral-status-pending' : (isApproved ? 'referral-status-approved' : 'referral-status-rejected');
          const statusLabel = isPending ? '⏳ Under Review by Coordinator' : (isApproved ? '✅ Published to Hub' : '❌ Dismissed');

          return `
            <div class="opp-card" onclick="OPPORTUNITIES.openReferralDetailModal('${ref.id}')">
              <div class="opp-card-top">
                <div class="opp-company-meta">
                  <div class="opp-company-avatar">${escapeHtml((ref.company || 'Co').slice(0, 2).toUpperCase())}</div>
                  <div>
                    <h3 class="opp-title">${escapeHtml(ref.title || 'Untitled')}</h3>
                    <p class="opp-company">${escapeHtml(ref.company || '')} · 📍 ${escapeHtml(ref.location || 'Remote')}</p>
                  </div>
                </div>
                <span class="referral-status-badge ${badgeClass}">${statusLabel}</span>
              </div>

              ${ref.notesForCoordinator ? `<p style="font-size:12px; color:var(--muted); margin:4px 0 0;">Note to Coordinator: "${escapeHtml(ref.notesForCoordinator)}"</p>` : ''}

              <div class="opp-footer" style="margin-top:8px;">
                <span style="font-size:12px; color:var(--muted);">Submitted on ${formatDate(ref.postedAt || ref.createdAtDate)}</span>
                <button class="btn-secondary" style="width:auto; padding:6px 12px; font-size:12px; margin:0;" onclick="event.stopPropagation(); OPPORTUNITIES.openCoordinatorDirectChat()">💬 Message Coordinator</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // 7. Opportunity Detail View Modal
  function openDetailModal(id) {
    const item = allOpportunities.find(o => o.id === id);
    if (!item) return;

    const isAdmin = APP.getRole() === 'admin';
    const isInternship = item.type === 'Internship';
    const badgeClass = isInternship ? 'badge-internship' : 'badge-job';
    const typeIcon = isInternship ? '🎓' : '💼';
    const typeLabel = isInternship ? 'Internship' : 'Job Vacancy';
    const deadline = getDeadlineInfo(item.deadlineDate);

    const applyUrl = item.applyUrl ? (item.applyUrl.startsWith('http') || item.applyUrl.startsWith('mailto:') ? item.applyUrl : 'https://' + item.applyUrl) : '#';

    const skillsArray = (item.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    const skillsHtml = skillsArray.length > 0
      ? `<div style="margin-top:14px;">
           <label style="font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.7px; display:block; margin-bottom:8px;">Required Skills</label>
           <div class="opp-skills-list">${skillsArray.map(s => `<span class="opp-skill-tag" style="font-size:12px; padding:4px 10px;">${escapeHtml(s)}</span>`).join('')}</div>
         </div>`
      : '';

    const content = `
      <div class="profile-header" style="text-align:left; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="display:flex; gap:12px; align-items:center;">
            <div class="opp-company-avatar" style="width:48px; height:48px; font-size:18px;">${escapeHtml((item.company || 'Co').slice(0, 2).toUpperCase())}</div>
            <div>
              <h2 style="font-size:20px; font-weight:700; color:var(--text); line-height:1.2;">${escapeHtml(item.title)}</h2>
              <p style="font-size:14px; color:var(--accent2); font-weight:500; margin-top:2px;">${escapeHtml(item.company)}</p>
            </div>
          </div>
          <span class="opp-type-badge ${badgeClass}">${typeIcon} ${escapeHtml(typeLabel)}</span>
        </div>
      </div>

      <div class="profile-section" style="margin-bottom:18px;">
        <div class="info-row">
          <span class="key">📍 Location</span>
          <span class="val">${escapeHtml(item.location || 'Not specified')}</span>
        </div>
        ${item.stipendOrSalary ? `
        <div class="info-row">
          <span class="key">💰 Compensation</span>
          <span class="val" style="color:var(--green); font-weight:600;">${escapeHtml(item.stipendOrSalary)}</span>
        </div>` : ''}
        ${item.eligibility ? `
        <div class="info-row">
          <span class="key">🎯 Target Eligibility</span>
          <span class="val">${escapeHtml(item.eligibility)}</span>
        </div>` : ''}
        ${item.experience ? `
        <div class="info-row">
          <span class="key">💼 Experience Level</span>
          <span class="val">${escapeHtml(item.experience)}</span>
        </div>` : ''}
        <div class="info-row">
          <span class="key">⏰ Application Deadline</span>
          <span class="val"><span class="opp-highlight-chip ${deadline.className}" style="display:inline-flex;">${deadline.label}</span></span>
        </div>
        ${item.postedAt ? `
        <div class="info-row">
          <span class="key">📅 Posted Date</span>
          <span class="val">${formatDate(item.postedAt)}</span>
        </div>` : ''}
        ${item.referredBy ? `
        <div class="info-row">
          <span class="key">👤 Alumni Referral</span>
          <span class="val" style="color:var(--accent2); font-weight:600;">${escapeHtml(item.referredBy)}</span>
        </div>` : ''}
      </div>

      ${skillsHtml}

      <div style="margin-top:18px;">
        <label style="font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.7px; display:block; margin-bottom:8px;">Role Details & Requirements</label>
        <div style="background:var(--surface2); padding:16px; border-radius:var(--radius-xs); border:1px solid var(--border); font-size:14px; line-height:1.7; color:var(--text); white-space:pre-wrap;">${escapeHtml(item.description || 'No additional details provided.')}</div>
      </div>

      <div style="margin-top:22px; display:flex; flex-direction:column; gap:10px;">
        <a href="${applyUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:flex; justify-content:center; align-items:center; gap:8px; text-decoration:none; font-weight:600; font-size:15px; padding:14px;">
          🚀 Open Application Link ↗
        </a>
        ${isAdmin ? `
          <div style="display:flex; gap:10px; margin-top:4px;">
            <button class="btn-secondary" style="flex:1;" onclick="OPPORTUNITIES.closeDetailModal(); OPPORTUNITIES.openEditModal('${item.id}')">✏️ Edit Vacancy</button>
            <button class="btn-danger" style="flex:1; width:auto; margin:0;" onclick="OPPORTUNITIES.closeDetailModal(); OPPORTUNITIES.deleteOpportunity('${item.id}')">🗑️ Delete Vacancy</button>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('oppDetailModalBody').innerHTML = content;
    document.getElementById('oppDetailModalOverlay').classList.add('open');
  }

  function closeDetailModal() {
    const overlay = document.getElementById('oppDetailModalOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  // 8. Alumni Referral Detail Modal (For Coordinator & Alumni)
  function openReferralDetailModal(id) {
    const ref = allReferrals.find(r => r.id === id);
    if (!ref) return;

    const isAdmin = APP.getRole() === 'admin';
    const isInternship = ref.type === 'Internship';
    const status = ref.status || 'pending';
    const isPending = status === 'pending';

    const applyUrl = ref.applyUrl ? (ref.applyUrl.startsWith('http') || ref.applyUrl.startsWith('mailto:') ? ref.applyUrl : 'https://' + ref.applyUrl) : '#';

    const content = `
      <div class="profile-header" style="text-align:left; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <span class="referral-status-badge ${isPending ? 'referral-status-pending' : (status === 'approved' ? 'referral-status-approved' : 'referral-status-rejected')}" style="margin-bottom:8px;">
              ${isPending ? '⏳ Pending Coordinator Review' : (status === 'approved' ? '✅ Approved & Published' : '❌ Dismissed')}
            </span>
            <h2 style="font-size:20px; font-weight:700; color:var(--text); line-height:1.2; margin-top:4px;">${escapeHtml(ref.title)}</h2>
            <p style="font-size:14px; color:var(--accent2); font-weight:500; margin-top:2px;">${escapeHtml(ref.company)} · 📍 ${escapeHtml(ref.location || 'Remote')}</p>
          </div>
          <span class="opp-type-badge ${isInternship ? 'badge-internship' : 'badge-job'}">${isInternship ? '🎓 Internship' : '💼 Job'}</span>
        </div>
      </div>

      <div style="background:rgba(124,106,247,0.08); border:1px solid rgba(124,106,247,0.25); border-radius:var(--radius-xs); padding:14px; margin-bottom:16px;">
        <div style="font-size:12px; font-weight:700; color:var(--accent2); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">👤 Submitting Alumni Details</div>
        <div style="font-size:14px; color:var(--text); font-weight:600;">${escapeHtml(ref.alumniName || 'Alumni Member')}</div>
        <div style="font-size:13px; color:var(--muted); margin-top:2px;">${escapeHtml(ref.alumniRole || '')} ${ref.alumniCompany ? '@ ' + escapeHtml(ref.alumniCompany) : ''} · ${escapeHtml(ref.alumniEmail || '')}</div>
        ${ref.notesForCoordinator ? `
          <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(124,106,247,0.15); font-size:13px; color:var(--text);">
            <strong>Alumni Note for Coordinator:</strong>
            <p style="margin:4px 0 0; font-style:italic;">"${escapeHtml(ref.notesForCoordinator)}"</p>
          </div>
        ` : ''}
      </div>

      <div class="profile-section" style="margin-bottom:16px;">
        ${ref.stipendOrSalary ? `
        <div class="info-row">
          <span class="key">💰 Compensation</span>
          <span class="val" style="color:var(--green); font-weight:600;">${escapeHtml(ref.stipendOrSalary)}</span>
        </div>` : ''}
        ${ref.eligibility ? `
        <div class="info-row">
          <span class="key">🎯 Target Batch / Eligibility</span>
          <span class="val">${escapeHtml(ref.eligibility)}</span>
        </div>` : ''}
        ${ref.deadlineDate ? `
        <div class="info-row">
          <span class="key">⏰ Application Deadline</span>
          <span class="val">${formatDate(ref.deadlineDate)}</span>
        </div>` : ''}
        <div class="info-row">
          <span class="key">🔗 Application URL / Email</span>
          <span class="val"><a href="${applyUrl}" target="_blank" style="color:var(--accent2);">${escapeHtml(ref.applyUrl)} ↗</a></span>
        </div>
      </div>

      ${ref.description ? `
        <div style="margin-top:14px;">
          <label style="font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.7px; display:block; margin-bottom:6px;">Role Description</label>
          <div style="background:var(--surface2); padding:14px; border-radius:var(--radius-xs); border:1px solid var(--border); font-size:13px; line-height:1.6; color:var(--text); white-space:pre-wrap;">${escapeHtml(ref.description)}</div>
        </div>
      ` : ''}

      <div style="margin-top:20px; display:flex; flex-direction:column; gap:8px;">
        ${isAdmin ? `
          <div style="display:flex; gap:10px;">
            ${isPending ? `<button class="btn-primary" style="flex:1;" onclick="OPPORTUNITIES.closeDetailModal(); OPPORTUNITIES.approveReferral('${ref.id}')">🚀 Approve & Post to Hub</button>` : ''}
            <button class="btn-secondary" style="flex:1;" onclick="OPPORTUNITIES.closeDetailModal(); OPPORTUNITIES.chatWithAlumni('${ref.alumniUid || ''}', '${escapeHtml(ref.alumniName || 'Alumni').replace(/'/g, "\\'")}')">💬 Chat with ${escapeHtml(ref.alumniName || 'Alumni')}</button>
          </div>
        ` : `
          <button class="btn-secondary" onclick="OPPORTUNITIES.closeDetailModal(); OPPORTUNITIES.openCoordinatorDirectChat()">💬 Message Placement Coordinator</button>
        `}
      </div>
    `;

    document.getElementById('oppDetailModalBody').innerHTML = content;
    document.getElementById('oppDetailModalOverlay').classList.add('open');
  }

  // 9. Alumni Submission Action: Open Alumni Share Modal
  function openAlumniShareModal() {
    if (APP.getRole() !== 'alumni') {
      UI.showToast('Only registered alumni can share vacancies with the coordinator.', true);
      return;
    }

    const modal = document.getElementById('alumniShareOppModalOverlay');
    if (!modal) return;

    ['alumni_opp_title', 'alumni_opp_company', 'alumni_opp_location', 'alumni_opp_salary', 'alumni_opp_deadline', 'alumni_opp_applyUrl', 'alumni_opp_eligibility', 'alumni_opp_skills', 'alumni_opp_description', 'alumni_opp_notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const typeEl = document.getElementById('alumni_opp_type');
    if (typeEl) typeEl.value = 'Job';

    const deadlineInput = document.getElementById('alumni_opp_deadline');
    if (deadlineInput) {
      deadlineInput.min = new Date().toISOString().split('T')[0];
    }

    modal.classList.add('open');
  }

  function closeAlumniShareModal() {
    const modal = document.getElementById('alumniShareOppModalOverlay');
    if (modal) modal.classList.remove('open');
  }

  // 10. Submit Alumni Opportunity to Coordinator
  async function submitAlumniOpportunity() {
    const user = APP.getUser();
    if (!user) {
      UI.showToast('Please login to share opportunities.', true);
      return;
    }

    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const title = getVal('alumni_opp_title');
    const type = getVal('alumni_opp_type') || 'Job';
    const company = getVal('alumni_opp_company');
    const location = getVal('alumni_opp_location');
    const stipendOrSalary = getVal('alumni_opp_salary');
    const deadlineDate = getVal('alumni_opp_deadline');
    const applyUrl = getVal('alumni_opp_applyUrl');
    const eligibility = getVal('alumni_opp_eligibility');
    const skills = getVal('alumni_opp_skills');
    const description = getVal('alumni_opp_description');
    const notesForCoordinator = getVal('alumni_opp_notes');

    if (!title || !company || !applyUrl) {
      UI.showToast('Please provide Title, Company Name, and Application Link.', true);
      return;
    }

    const btn = document.getElementById('submitAlumniOppBtn');
    if (btn) {
      btn.innerHTML = 'Sending to Coordinator…';
      btn.classList.add('loading');
    }

    try {
      // Fetch Alumni user profile details
      let alumniName = user.displayName || user.email;
      let alumniRole = '';
      let alumniCompany = '';
      try {
        const alumniDoc = await db.collection('alumni').doc(user.uid).get();
        if (alumniDoc.exists) {
          const d = alumniDoc.data();
          alumniName = d.name || alumniName;
          alumniRole = d.role || '';
          alumniCompany = d.company || '';
        }
      } catch(e){}

      const payload = {
        title,
        type,
        company,
        location: location || 'Remote / Hybrid',
        stipendOrSalary,
        deadlineDate: deadlineDate || '',
        applyUrl,
        eligibility,
        skills,
        description,
        notesForCoordinator,
        alumniUid: user.uid,
        alumniName,
        alumniEmail: user.email,
        alumniRole,
        alumniCompany,
        status: 'pending', // 'pending' | 'approved' | 'rejected'
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        postedAt: new Date().toISOString().split('T')[0]
      };

      await db.collection('alumni_shared_opportunities').add(payload);

      // Automated direct notification into Coordinator Chat
      sendNotificationToCoordinator(user, alumniName, title, company, type, applyUrl, notesForCoordinator);

      UI.showToast('✓ Opportunity sent to College Coordinator for review!');
      closeAlumniShareModal();

      // Switch to My Referrals tab
      setTab('MyReferrals');
    } catch (err) {
      console.error('Error submitting opportunity:', err);
      UI.showToast('Failed to submit: ' + err.message, true);
    } finally {
      if (btn) {
        btn.innerHTML = '🚀 Send to Coordinator';
        btn.classList.remove('loading');
      }
    }
  }

  // 11. Coordinator Actions: Approve Referral & Publish Live to Hub
  async function approveReferral(refId) {
    if (APP.getRole() !== 'admin') {
      UI.showToast('Only Coordinators can approve opportunities.', true);
      return;
    }

    const ref = allReferrals.find(r => r.id === refId);
    if (!ref) return;

    try {
      // 1. Create live public opportunity
      const oppPayload = {
        title: ref.title,
        type: ref.type || 'Job',
        company: ref.company,
        location: ref.location || '',
        stipendOrSalary: ref.stipendOrSalary || '',
        deadlineDate: ref.deadlineDate || '',
        applyUrl: ref.applyUrl,
        eligibility: ref.eligibility || '',
        skills: ref.skills || '',
        description: ref.description || '',
        referredBy: `${ref.alumniName || 'Alumni'} (${ref.alumniCompany || 'Alumni Network'})`,
        postedBy: (APP.getUser() ? APP.getUser().email : 'Coordinator'),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        postedAt: new Date().toISOString().split('T')[0]
      };

      await db.collection('opportunities').add(oppPayload);

      // 2. Mark referral as approved
      await db.collection('alumni_shared_opportunities').doc(refId).update({
        status: 'approved',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 3. Send congratulatory chat message to submitting alumni
      if (ref.alumniUid && typeof CHAT !== 'undefined') {
        const approvalMsg = `🎉 Hello ${ref.alumniName || 'Alumni'}! Your submitted opportunity "${ref.title}" at ${ref.company} has been approved and published to the Opportunity Hub for our college students. Thank you for supporting your alma mater! 🚀`;
        CHAT.sendSystemMessageToUser(ref.alumniUid, approvalMsg);
      }

      UI.showToast('✓ Opportunity published live to the Opportunities Hub!');
      renderList();
    } catch (err) {
      console.error('Approval error:', err);
      UI.showToast('Failed to approve: ' + err.message, true);
    }
  }

  // 12. Delete / Dismiss Referral
  async function deleteReferral(refId) {
    if (APP.getRole() !== 'admin') {
      UI.showToast('Only Coordinators can manage referrals.', true);
      return;
    }

    if (!confirm('Permanently remove this alumni referral?')) return;

    try {
      await db.collection('alumni_shared_opportunities').doc(refId).delete();
      UI.showToast('Referral removed.');
      renderList();
    } catch (err) {
      UI.showToast('Failed to delete: ' + err.message, true);
    }
  }

  // 13. Coordinator CRUD Operations (Direct Publishing by Admin)
  function openCreateModal() {
    if (APP.getRole() !== 'admin') return;
    editingId = null;

    document.getElementById('oppModalTitle').innerText = '✨ Post New Opportunity';
    document.getElementById('oppModalSubtitle').innerText = 'Publish an Internship or Job vacancy for students & alumni';
    document.getElementById('saveOppBtn').innerText = '🚀 Publish Opportunity';

    ['opp_title', 'opp_company', 'opp_location', 'opp_salary', 'opp_deadline', 'opp_applyUrl', 'opp_eligibility', 'opp_experience', 'opp_skills', 'opp_description'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const typeEl = document.getElementById('opp_type');
    if (typeEl) typeEl.value = 'Internship';

    const deadlineInput = document.getElementById('opp_deadline');
    if (deadlineInput) {
      deadlineInput.min = new Date().toISOString().split('T')[0];
    }

    document.getElementById('oppModalOverlay').classList.add('open');
  }

  function openEditModal(id) {
    if (APP.getRole() !== 'admin') return;
    const item = allOpportunities.find(o => o.id === id);
    if (!item) return;

    editingId = id;
    document.getElementById('oppModalTitle').innerText = '✏️ Edit Opportunity';
    document.getElementById('oppModalSubtitle').innerText = 'Update vacancy details, deadline, or application link';
    document.getElementById('saveOppBtn').innerText = '💾 Save Changes';

    const setVal = (inputId, val) => {
      const el = document.getElementById(inputId);
      if (el) el.value = val || '';
    };

    setVal('opp_title', item.title);
    setVal('opp_type', item.type || 'Internship');
    setVal('opp_company', item.company);
    setVal('opp_location', item.location);
    setVal('opp_salary', item.stipendOrSalary);
    setVal('opp_deadline', item.deadlineDate);
    setVal('opp_applyUrl', item.applyUrl);
    setVal('opp_eligibility', item.eligibility);
    setVal('opp_experience', item.experience);
    setVal('opp_skills', item.skills);
    setVal('opp_description', item.description);

    document.getElementById('oppModalOverlay').classList.add('open');
  }

  function closeFormModal() {
    const overlay = document.getElementById('oppModalOverlay');
    if (overlay) overlay.classList.remove('open');
    editingId = null;
  }

  async function saveOpportunity() {
    if (APP.getRole() !== 'admin') {
      UI.showToast('Only Coordinators can manage opportunities.', true);
      return;
    }

    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const title = getVal('opp_title');
    const type = getVal('opp_type') || 'Internship';
    const company = getVal('opp_company');
    const location = getVal('opp_location');
    const stipendOrSalary = getVal('opp_salary');
    const deadlineDate = getVal('opp_deadline');
    const applyUrl = getVal('opp_applyUrl');
    const eligibility = getVal('opp_eligibility');
    const experience = getVal('opp_experience');
    const skills = getVal('opp_skills');
    const description = getVal('opp_description');

    if (!title || !company || !deadlineDate || !applyUrl) {
      UI.showToast('Please fill in Title, Company, Deadline, and Apply URL.', true);
      return;
    }

    const deadlineInfo = getDeadlineInfo(deadlineDate);
    if (deadlineInfo.expired) {
      UI.showToast('Application deadline cannot be in the past.', true);
      return;
    }

    const btn = document.getElementById('saveOppBtn');
    btn.innerHTML = editingId ? 'Saving…' : 'Publishing…';
    btn.classList.add('loading');

    const payload = {
      title,
      type,
      company,
      location,
      stipendOrSalary,
      deadlineDate,
      applyUrl,
      eligibility,
      experience,
      skills,
      description,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (editingId) {
        await db.collection('opportunities').doc(editingId).update(payload);
        UI.showToast('✓ Opportunity updated successfully!');
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        payload.postedAt = new Date().toISOString().split('T')[0];
        payload.postedBy = (APP.getUser() ? APP.getUser().email : 'Coordinator');
        await db.collection('opportunities').add(payload);
        UI.showToast('✓ Opportunity published to the Hub!');
      }

      closeFormModal();
    } catch (err) {
      console.error('Error saving opportunity:', err);
      UI.showToast('Failed to save: ' + err.message, true);
    } finally {
      btn.innerHTML = editingId ? '💾 Save Changes' : '🚀 Publish Opportunity';
      btn.classList.remove('loading');
    }
  }

  async function deleteOpportunity(id) {
    if (APP.getRole() !== 'admin') {
      UI.showToast('Only Coordinators can delete opportunities.', true);
      return;
    }

    if (!confirm('Permanently remove this opportunity?')) return;

    try {
      await db.collection('opportunities').doc(id).delete();
      UI.showToast('Opportunity removed.');
    } catch (err) {
      console.error('Error deleting opportunity:', err);
      UI.showToast('Failed to delete: ' + err.message, true);
    }
  }

  // 14. Chat Handshake Helpers
  function chatWithAlumni(alumniUid, alumniName) {
    if (!alumniUid) {
      UI.showToast('Cannot open chat for this alumni record.', true);
      return;
    }
    closeDetailModal();
    if (typeof CHAT !== 'undefined') {
      CHAT.openBox(alumniUid, alumniName || 'Alumni');
    }
  }

  function openCoordinatorDirectChat() {
    closeDetailModal();
    if (typeof CHAT !== 'undefined') {
      CHAT.openCoordinatorChat('💼 [Opportunity Lead] Hi Coordinator, I would like to discuss a job vacancy / internship opening.');
    }
  }

  async function sendNotificationToCoordinator(currentUser, alumniName, title, company, type, applyUrl, notes) {
    try {
      // Find Admin UID
      const adminSnap = await db.collection('admins').limit(1).get();
      if (!adminSnap.empty) {
        const adminUid = adminSnap.docs[0].id;
        const msgText = `💼 [New Opportunity Referral] ${alumniName} shared a ${type} lead:\n• Role: ${title}\n• Company: ${company}\n• Link: ${applyUrl}${notes ? '\n• Note: ' + notes : ''}`;
        
        if (typeof CHAT !== 'undefined') {
          CHAT.sendStructuredMessage(currentUser.uid, adminUid, msgText, alumniName, 'Coordinator');
        }
      }
    } catch(e) {
      console.warn('Coordinator chat notify error:', e);
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }

  return {
    startListener,
    startReferralsListener,
    renderList,
    setTab,
    onSearch,
    openCreateModal,
    openEditModal,
    openDetailModal,
    openReferralDetailModal,
    openAlumniShareModal,
    closeAlumniShareModal,
    submitAlumniOpportunity,
    approveReferral,
    deleteReferral,
    chatWithAlumni,
    openCoordinatorDirectChat,
    closeFormModal,
    closeDetailModal,
    saveOpportunity,
    deleteOpportunity
  };
})();
