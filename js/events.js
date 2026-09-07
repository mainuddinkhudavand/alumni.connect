// ============================================================
//  EVENTS.JS — Updated Broadcast Notice Board Engine
// ============================================================
const EVENTS = (() => {
  let eventsUnsubscribe = null;
  let latestEventTimestamp = null;

  // NEW: Login-triggered check for notifications
  async function checkNewEventsForLogin() {
    const lastSeen = parseInt(localStorage.getItem('alumni_last_seen_event') || '0');
    const snap = await db.collection('events').orderBy('createdAt', 'desc').limit(1).get();
    
    if (!snap.empty) {
      const latestEvent = snap.docs[0].data();
      if (latestEvent.createdAt) {
        const latestTime = latestEvent.createdAt.toDate().getTime();
        const badge = document.getElementById('globalEventsBadge');
        if (badge && latestTime > lastSeen) {
          badge.style.setProperty('display', 'flex', 'important');
        }
      }
    }
  }

  // Add this to your EVENTS object in js/events.js
  async function checkEventsVisibility() {
      const badge = document.getElementById('globalEventsBadge');
      if (!badge) return;

      // We fetch one doc to see if the collection has ANY content
      const snap = await db.collection('events').limit(1).get();
      
      // If the database has events, make the badge visible (flex)
      // If it's empty, hide it (none)
      badge.style.setProperty('display', !snap.empty ? 'flex' : 'none', 'important');
  }

  // 1. Live Background Stream Observer
  function startEventsListener() {
    const currentUser = APP.getUser();
    if (!currentUser) return;

    if (eventsUnsubscribe) eventsUnsubscribe();

    const timelineContainer = document.getElementById('eventsTimeline');

    eventsUnsubscribe = db.collection('events')
      .orderBy('createdAt', 'desc')
      .onSnapshot((snap) => {
        if (snap.empty) {
          if (timelineContainer) timelineContainer.innerHTML = '<div class="empty">📅 No college events posted yet.</div>';
          const eventsBadge = document.getElementById('globalEventsBadge');
          if (eventsBadge) eventsBadge.style.display = 'none';
          return;
        }

        const eventsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (eventsData[0] && eventsData[0].createdAt) {
          latestEventTimestamp = eventsData[0].createdAt.toDate().getTime();
          evaluateNotificationBadge();
        }

        const eventsPage = document.getElementById('page-events');
        if (eventsPage && eventsPage.classList.contains('active')) {
          renderEventsTimeline(eventsData);
        }
      }, err => console.error("Events channel listener crash:", err));
  }

  function evaluateNotificationBadge() {
    const eventsBadge = document.getElementById('globalEventsBadge');
    if (!eventsBadge || !latestEventTimestamp) return;

    const eventsPage = document.getElementById('page-events');
    if (eventsPage && eventsPage.classList.contains('active')) {
      markEventsAsViewed();
      return;
    }

    const lastViewed = parseInt(localStorage.getItem('alumni_last_seen_event') || '0');
    eventsBadge.style.setProperty('display', latestEventTimestamp > lastViewed ? 'flex' : 'none', 'important');
  }

  function markEventsAsViewed() {
    if (latestEventTimestamp) {
      localStorage.setItem('alumni_last_seen_event', latestEventTimestamp);
      const eventsBadge = document.getElementById('globalEventsBadge');
      if (eventsBadge) eventsBadge.style.display = 'none';
    }
  }

  let editingId = null;
  let cachedEventsData = [];

  // Helper: Escape HTML strings
  function escapeHtml(text) {
    if (!text) return '';
    return text.toString().replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  // 2. Client UI Layout Renderer
  function renderEventsTimeline(events) {
    cachedEventsData = events || [];
    const timelineContainer = document.getElementById('eventsTimeline');
    if (!timelineContainer) return;

    const isAdmin = APP.getRole() === 'admin';

    timelineContainer.innerHTML = events.map((event, idx) => {
      const bannerHtml = event.bannerUrl ? `
        <div style="position:relative; margin-bottom:12px;">
          <img src="${event.bannerUrl}" class="event-banner-img" onclick="EVENTS.openEventLightboxByIndex(${idx})" title="Click to enlarge">
          <span style="position:absolute; bottom:18px; right:8px; background:rgba(0,0,0,0.65); color:#fff; font-size:10px; padding:3px 8px; border-radius:12px; pointer-events:none; backdrop-filter:blur(4px);">🔍 Click to view</span>
        </div>` : '';
      const eventDate = event.createdAt ? new Date(event.createdAt.toDate()).toLocaleDateString() : 'Recent Announcement';
      const adminControlsHtml = isAdmin ? `
        <div style="display:flex; gap:10px; margin-top:14px; align-items:center;">
          <button class="btn-secondary" style="padding: 8px 14px; font-size: 12px; width: auto; margin:0;" onclick="EVENTS.openEditModal('${event.id}')">✏️ Edit Notice</button>
          <button class="btn-danger" style="padding: 8px 14px; font-size: 12px; width: auto; margin:0;" onclick="EVENTS.deleteCollegeEvent('${event.id}')">🗑️ Delete Notice</button>
        </div>
      ` : '';

      return `
        <div class="profile-section" style="margin-bottom: 16px; padding: 20px; background: var(--surface);">
          ${bannerHtml}
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <h3 style="font-size:17px; font-weight:700; color:var(--accent2);">${escapeHtml(event.title)}</h3>
            <span style="font-size:11px; background:var(--surface2); padding:3px 10px; border-radius:50px; color:var(--muted);">${eventDate}</span>
          </div>
          <div style="font-size:13px; color:var(--muted); margin-bottom:10px;">
            <div>🗓️ <b>Date:</b> ${escapeHtml(event.date || 'To be announced')}</div>
            <div>📍 <b>Venue:</b> ${escapeHtml(event.venue || 'Main Campus')}</div>
          </div>
          <p style="font-size:14px; color:var(--text); white-space:pre-wrap;">${escapeHtml(event.description)}</p>
          ${adminControlsHtml}
        </div>
      `;
    }).join('');
    markEventsAsViewed();
  }

  // 3. Admin Event Creation / Editing Controller
  function openCreateModal() {
    if (APP.getRole() !== 'admin') return;
    editingId = null;

    document.getElementById('eventModalTitle').innerText = '📢 Post New Event Notice';
    document.getElementById('eventModalSubtitle').innerText = 'Broadcast official announcements instantly to the college network timeline';
    document.getElementById('postEventBtn').innerText = '📢 Post Event Announcement';

    ['e_title', 'e_date', 'e_venue', 'e_desc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const bannerInput = document.getElementById('e_bannerFile');
    if (bannerInput) bannerInput.value = '';
    
    // Clear preview
    const previewContainer = document.getElementById('e_bannerPreviewContainer');
    const previewImg = document.getElementById('e_bannerPreviewImg');
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImg) previewImg.src = '';

    document.getElementById('eventModalOverlay').classList.add('open');
  }

  function openEditModal(id) {
    if (APP.getRole() !== 'admin') return;
    const item = cachedEventsData.find(e => e.id === id);
    if (!item) return;

    editingId = id;
    document.getElementById('eventModalTitle').innerText = '✏️ Edit Event Notice';
    document.getElementById('eventModalSubtitle').innerText = 'Update title, date, venue, banner image, or guidelines';
    document.getElementById('postEventBtn').innerText = '💾 Save Changes';

    const setVal = (inputId, val) => {
      const el = document.getElementById(inputId);
      if (el) el.value = val || '';
    };

    setVal('e_title', item.title);
    setVal('e_date', item.date);
    setVal('e_venue', item.venue);
    setVal('e_desc', item.description);
    const bannerInput = document.getElementById('e_bannerFile');
    if (bannerInput) bannerInput.value = '';

    // Show existing banner in preview if available
    const previewContainer = document.getElementById('e_bannerPreviewContainer');
    const previewImg = document.getElementById('e_bannerPreviewImg');
    if (item.bannerUrl) {
      if (previewImg) previewImg.src = item.bannerUrl;
      if (previewContainer) previewContainer.style.display = 'block';
    } else {
      if (previewContainer) previewContainer.style.display = 'none';
      if (previewImg) previewImg.src = '';
    }

    document.getElementById('eventModalOverlay').classList.add('open');
  }

  function previewUploadBanner(input) {
    const previewContainer = document.getElementById('e_bannerPreviewContainer');
    const previewImg = document.getElementById('e_bannerPreviewImg');
    if (input && input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (previewImg) previewImg.src = e.target.result;
        if (previewContainer) previewContainer.style.display = 'block';
      };
      reader.readAsDataURL(input.files[0]);
    } else {
      if (previewContainer) previewContainer.style.display = 'none';
      if (previewImg) previewImg.src = '';
    }
  }

  // 4. Image Lightbox Viewers (Enlarge for Students, Alumni & Coordinators)
  function openEventLightboxByIndex(idx) {
    const item = cachedEventsData[idx];
    if (item && item.bannerUrl) {
      openLightbox(item.bannerUrl, item.title || 'Event Notice');
    }
  }

  function openLightbox(imgSrc, caption = '') {
    if (!imgSrc) return;
    const overlay = document.getElementById('imageLightboxOverlay');
    const lightboxImg = document.getElementById('lightboxImg');
    const captionEl = document.getElementById('lightboxCaption');
    if (lightboxImg) lightboxImg.src = imgSrc;
    if (captionEl) captionEl.textContent = caption || '';
    if (overlay) overlay.classList.add('open');
  }

  function closeLightbox() {
    const overlay = document.getElementById('imageLightboxOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function closeEventModal() {
    const overlay = document.getElementById('eventModalOverlay');
    if (overlay) overlay.classList.remove('open');
    editingId = null;
    const previewContainer = document.getElementById('e_bannerPreviewContainer');
    const previewImg = document.getElementById('e_bannerPreviewImg');
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImg) previewImg.src = '';
  }

  async function saveCollegeEvent() {
    if (APP.getRole() !== 'admin') return;

    const btn = document.getElementById('postEventBtn');
    const title = document.getElementById('e_title').value.trim();
    const date = document.getElementById('e_date').value.trim();
    const venue = document.getElementById('e_venue').value.trim();
    const description = document.getElementById('e_desc').value.trim();
    const imageInput = document.getElementById('e_bannerFile');

    if (!title || !description) {
      UI.showToast('Event Title and Description are required.', true);
      return;
    }

    btn.innerHTML = editingId ? 'Saving…' : 'Broadcasting…';
    btn.classList.add('loading');

    try {
      let bannerUrl = null;
      if (imageInput?.files[0]) {
        bannerUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(imageInput.files[0]);
          reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const scale = 800 / img.width;
              canvas.width = 800;
              canvas.height = img.height * scale;
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
          };
        });
      }

      const payload = {
        title, date, venue, description,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (bannerUrl) payload.bannerUrl = bannerUrl;

      if (editingId) {
        await db.collection('events').doc(editingId).update(payload);
        UI.showToast('✓ Event notice updated!');
      } else {
        if (bannerUrl) payload.bannerUrl = bannerUrl;
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('events').add(payload);
        UI.showToast('✓ Event posted!');
      }

      ['e_title', 'e_date', 'e_venue', 'e_desc'].forEach(id => document.getElementById(id).value = '');
      if (imageInput) imageInput.value = '';
      closeEventModal();
    } catch (err) {
      UI.showToast("Failed to save: " + err.message, true);
    } finally {
      btn.innerHTML = editingId ? '💾 Save Changes' : '📢 Post Event Announcement';
      btn.classList.remove('loading');
    }
  }

  async function deleteCollegeEvent(id) {
    if (!confirm("Delete this notice?")) return;
    try {
      await db.collection('events').doc(id).delete();
      UI.showToast("Notice scrubbed.");
    } catch (err) { UI.showToast("Failed to scrub: " + err.message, true); }
  }

  return { 
    startEventsListener, 
    renderEventsTimeline, 
    openCreateModal,
    openEditModal,
    closeEventModal,
    previewUploadBanner,
    openLightbox,
    openEventLightboxByIndex,
    closeLightbox,
    saveCollegeEvent, 
    deleteCollegeEvent, 
    evaluateNotificationBadge, 
    checkNewEventsForLogin, 
    checkEventsVisibility, 
    clearEvents: () => { if(eventsUnsubscribe) eventsUnsubscribe(); } 
  };
})();