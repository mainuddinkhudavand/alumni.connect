// ============================================================
//  CHAT.JS — 24-Hour Disappearing Peer-to-Peer Messaging Engine
//  Instant real-time communication across Students, Alumni & Coordinators
//  with dedicated Alumni-to-Coordinator direct communication channel.
// ============================================================
const CHAT = (() => {
  let activeRoomId = null;
  let activeTargetUid = null;
  let activeTargetName = null;
  let chatUnsubscribe = null;
  let inboxUnsubscribe = null;
  let allRoomsData = [];
  let inboxSearchQuery = '';

  // Helper: Format relative timestamp (e.g. "Just now", "5m ago", "2h ago", "Yesterday")
  function formatRelativeTime(date) {
    if (!date) return '';
    const now = Date.now();
    const time = date instanceof Date ? date.getTime() : (date.toDate ? date.toDate().getTime() : (typeof date === 'number' ? date : now));
    const diffSec = Math.floor((now - time) / 1000);

    if (diffSec < 45) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // 1. Initialize Real-Time Inbox Listener with instant cache loading
  function initInboxListener() {
    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);
    if (!currentUser) return;

    if (inboxUnsubscribe) {
      inboxUnsubscribe();
      inboxUnsubscribe = null;
    }

    const inboxList = document.getElementById('inboxList');

    // Instant Cache Loading from LocalStorage for zero-wait UI rendering
    try {
      const cachedStr = localStorage.getItem('alumni_chats_' + currentUser.uid);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (Array.isArray(cached) && cached.length > 0 && allRoomsData.length === 0) {
          allRoomsData = cached;
          renderInboxList();
        }
      }
    } catch (e) {
      console.warn("Local chat cache load:", e);
    }

    if (inboxList && allRoomsData.length === 0) {
      inboxList.innerHTML = '<div class="empty"><div class="icon">⏳</div><p>Loading conversations…</p></div>';
    }

    try {
      inboxUnsubscribe = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot(async (snap) => {
          const globalBadge = document.getElementById('globalUnreadBadge');

          if (!snap || snap.empty) {
            allRoomsData = [];
            try { localStorage.removeItem('alumni_chats_' + currentUser.uid); } catch(e){}
            if (inboxList) {
              inboxList.innerHTML = `
                <div class="empty">
                  <div class="icon">💬</div>
                  <p>No active conversations yet.</p>
                  <button class="btn-primary" style="margin-top:14px; width:auto; padding:8px 20px;" onclick="CHAT.openNewChatModal()">✍️ Start a Conversation</button>
                </div>
              `;
            }
            if (globalBadge) globalBadge.style.display = 'none';
            return;
          }

          let totalUnreadCount = 0;
          const rooms = [];
          const alumniCache = window._fullAlumniCache || [];

          snap.docs.forEach(doc => {
            try {
              if (!doc.exists) return;
              const room = doc.data();
              if (!room || !room.participants || !Array.isArray(room.participants)) return;

              const targetUid = room.participants.find(uid => uid !== currentUser.uid);
              if (!targetUid) return;

              const unreadCount = (room.unreadCounts && room.unreadCounts[currentUser.uid]) || 0;
              totalUnreadCount += unreadCount;

              const lastUpdatedTime = room.lastUpdated ? room.lastUpdated.toDate().getTime() : (room.lastUpdatedMillis || Date.now());
              
              const isExpired = (Date.now() - lastUpdatedTime) > (24 * 60 * 60 * 1000);
              const displayMsg = isExpired ? 'No recent messages' : (room.lastMessage || 'Started a conversation');

              // Resolve target name
              let resolvedName = (room.participantNames && room.participantNames[targetUid]) || '';
              if (!resolvedName) {
                const targetAlumni = alumniCache.find(a => a.id === targetUid || a.uid === targetUid);
                if (targetAlumni) resolvedName = targetAlumni.name;
              }
              if (!resolvedName) {
                try { resolvedName = localStorage.getItem('user_name_' + targetUid) || ''; } catch(e){}
              }
              if (!resolvedName) {
                resolvedName = room.targetName || 'Member';
                db.collection('alumni').doc(targetUid).get().then(d => {
                  if (d.exists && d.data().name) {
                    localStorage.setItem('user_name_' + targetUid, d.data().name);
                    renderInboxList();
                  }
                }).catch(()=>{});
              }

              rooms.push({
                roomId: doc.id,
                targetUid,
                unreadCount,
                lastMessage: displayMsg,
                lastSenderId: room.lastSenderId || '',
                lastSenderName: room.lastSenderName || '',
                lastUpdated: lastUpdatedTime,
                targetName: resolvedName,
                targetAvatar: (room.participantAvatars && room.participantAvatars[targetUid]) || ''
              });
            } catch (itemErr) {
              console.warn("Skipping room record:", itemErr);
            }
          });

          rooms.sort((a, b) => b.lastUpdated - a.lastUpdated);
          allRoomsData = rooms;

          try {
            localStorage.setItem('alumni_chats_' + currentUser.uid, JSON.stringify(rooms));
          } catch (e) {}

          if (globalBadge) {
            if (totalUnreadCount > 0) {
              globalBadge.textContent = totalUnreadCount;
              globalBadge.style.setProperty('display', 'flex', 'important');
            } else {
              globalBadge.textContent = '0';
              globalBadge.style.display = 'none';
            }
          }

          renderInboxList();
        }, err => {
          console.error("Inbox listener error:", err);
          if (inboxList && allRoomsData.length === 0) {
            inboxList.innerHTML = `
              <div class="empty">
                <div class="icon">💬</div>
                <p>No active conversations yet.</p>
                <button class="btn-primary" style="margin-top:14px; width:auto; padding:8px 20px;" onclick="CHAT.openNewChatModal()">✍️ Start a Conversation</button>
              </div>
            `;
          }
        });
    } catch (e) {
      console.error("Inbox listener init failed:", e);
      if (inboxList && allRoomsData.length === 0) {
        inboxList.innerHTML = '<div class="empty"><p>No active conversations yet.</p></div>';
      }
    }
  }

  // 2. Render Inbox Conversations List on Main Messages Page
  function renderInboxList() {
    const inboxList = document.getElementById('inboxList');
    if (!inboxList) return;

    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);
    const alumniCache = window._fullAlumniCache || [];

    let filteredRooms = allRoomsData;
    if (inboxSearchQuery) {
      filteredRooms = allRoomsData.filter(room => {
        const targetUser = alumniCache.find(a => a.id === room.targetUid || a.uid === room.targetUid);
        const name = targetUser ? targetUser.name : (room.targetName || 'User');
        return name.toLowerCase().includes(inboxSearchQuery) || (room.lastMessage || '').toLowerCase().includes(inboxSearchQuery);
      });
    }

    if (filteredRooms.length === 0) {
      if (inboxSearchQuery) {
        inboxList.innerHTML = `<div class="empty"><div class="icon">🔍</div><p>No conversations match "${escapeHtml(inboxSearchQuery)}".</p></div>`;
      } else {
        inboxList.innerHTML = `
          <div class="empty">
            <div class="icon">💬</div>
            <p>No active conversations yet.</p>
            <button class="btn-primary" style="margin-top:14px; width:auto; padding:8px 20px;" onclick="CHAT.openNewChatModal()">✍️ Start a Conversation</button>
          </div>
        `;
      }
      return;
    }

    inboxList.innerHTML = filteredRooms.map(room => {
      const targetUser = alumniCache.find(a => a.id === room.targetUid || a.uid === room.targetUid);
      const name = targetUser ? targetUser.name : (room.targetName || 'Network Member');
      const branchInfo = targetUser 
        ? `${targetUser.branch || ''} ${targetUser.year ? '· Class of ' + targetUser.year : ''}`.trim()
        : 'Student / Alumni Network';

      const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      const avatarSrc = (targetUser && targetUser.avatarUrl) || room.targetAvatar;
      const avatarHtml = avatarSrc 
        ? `<img src="${avatarSrc}" class="avatar" style="object-fit: cover; width:44px; height:44px; border-radius:50%;">` 
        : `<div class="avatar" style="background:var(--surface3); color:var(--accent2); width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px;">${initials}</div>`;

      const unreadBadge = room.unreadCount > 0 
        ? `<div class="unread-badge" style="background:var(--red); color:#fff; font-size:10px; font-weight:700; border-radius:50%; min-width:18px; height:18px; display:flex; align-items:center; justify-content:center; padding:2px; font-family:'DM Sans', sans-serif;">${room.unreadCount}</div>` 
        : '';

      const msgWeight = room.unreadCount > 0 ? 'font-weight: 600; color: var(--text);' : 'color: var(--muted);';
      const timeStr = formatRelativeTime(room.lastUpdated);
      const isMe = (currentUser && room.lastSenderId === currentUser.uid);
      const youPrefix = isMe ? '<span style="color:var(--accent2); font-weight:500;">You: </span>' : '';

      return `
        <div class="chat-thread-card" onclick="CHAT.openBox('${room.targetUid}', '${escapeHtml(name).replace(/'/g, "\\'")}')">
          <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
            <div style="position:relative; flex-shrink:0;">
              ${avatarHtml}
              <div style="position:absolute; bottom:1px; right:1px; width:10px; height:10px; border-radius:50%; background:var(--green); border:2px solid var(--surface);"></div>
            </div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px;">
                <h3 style="font-size:15px; font-weight:600; color:var(--text); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(name)}</h3>
                <span style="font-size:11px; color:var(--muted); margin-left:8px; flex-shrink:0;">${timeStr}</span>
              </div>
              <p style="font-size:11px; color:var(--muted); margin:0 0 3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(branchInfo || 'Member')}</p>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <p style="font-size:13px; margin:0; ${msgWeight} white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:210px;">
                  ${youPrefix}${escapeHtml(room.lastMessage)}
                </p>
                ${unreadBadge}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function onInboxSearch(query) {
    inboxSearchQuery = (query || '').toLowerCase().trim();
    renderInboxList();
  }

  // 3. Mount Individual Direct Chat Window
  async function openBox(targetUid, targetName) {
    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);
    if (!currentUser) return;

    if (!targetUid) {
      UI.showToast("Cannot open chat for invalid contact.", true);
      return;
    }

    if (currentUser.uid === targetUid) {
      UI.showToast("You cannot start a chat with yourself!", true);
      return;
    }

    activeRoomId = [currentUser.uid, targetUid].sort().join('_');
    activeTargetUid = targetUid;
    activeTargetName = targetName || 'Member';

    try {
      localStorage.setItem('user_name_' + targetUid, activeTargetName);
    } catch(e){}

    const nameEl = document.getElementById('chatParticipantName');
    if (nameEl) nameEl.textContent = activeTargetName;

    const statusEl = document.getElementById('chatParticipantStatus');
    if (statusEl) {
      if (activeTargetName.toLowerCase().includes('coordinator') || activeTargetName.toLowerCase().includes('admin')) {
        statusEl.innerHTML = '⭐ College Placement Coordinator Desk';
      } else {
        statusEl.innerHTML = '🟢 Active Network Connection';
      }
    }

    // Toggle quick chips based on role
    const quickChips = document.getElementById('chatQuickChips');
    if (quickChips) {
      quickChips.style.display = (APP.getRole() === 'alumni' || activeTargetName.toLowerCase().includes('coordinator')) ? 'flex' : 'none';
    }

    document.getElementById('chatOverlay').classList.add('open');

    const directoryModal = document.getElementById('modalOverlay');
    if (directoryModal) directoryModal.classList.remove('open');
    closeNewChatModal();

    listenToMessages();

    try {
      await db.collection('chats').doc(activeRoomId).set({
        unreadCounts: { [currentUser.uid]: 0 }
      }, { merge: true });
    } catch (e) {
      console.warn("Clear unread counts error:", e);
    }
  }

  // 4. Live Message Stream Observer
  function listenToMessages() {
    if (chatUnsubscribe) {
      chatUnsubscribe();
      chatUnsubscribe = null;
    }

    const stream = document.getElementById('messageStream');
    if (stream) {
      stream.innerHTML = '<div class="empty"><div class="icon">⏳</div><p>Syncing conversation…</p></div>';
    }

    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);
    if (!currentUser || !activeRoomId) return;

    chatUnsubscribe = db.collection('chats').doc(activeRoomId).collection('messages')
      .orderBy('timestamp', 'asc')
      .onSnapshot(snap => {
        if (!stream) return;

        const now = Date.now();
        const validMsgs = [];
        const expiredDocRefs = [];

        if (snap && !snap.empty) {
          snap.docs.forEach(doc => {
            if (!doc.exists) return;
            const msg = doc.data();
            const msgTime = msg.timestamp ? msg.timestamp.toDate().getTime() : (msg.createdAt || now);

            if ((now - msgTime) > (24 * 60 * 60 * 1000)) {
              expiredDocRefs.push(doc.ref);
            } else {
              validMsgs.push({ id: doc.id, ...msg, msgTime });
            }
          });
        }

        if (expiredDocRefs.length > 0) {
          expiredDocRefs.forEach(ref => {
            ref.delete().catch(err => console.warn("Message purge:", err));
          });
        }

        if (validMsgs.length === 0) {
          stream.innerHTML = `
            <div class="empty">
              <div class="icon">👋</div>
              <p>Say hello to start the conversation!</p>
            </div>
          `;
          return;
        }

        const readBatch = db.batch();
        let unreadFound = false;
        let html = '';

        validMsgs.forEach(msg => {
          const isMe = msg.senderId === currentUser.uid;

          if (!isMe && msg.read === false) {
            const docRef = db.collection('chats').doc(activeRoomId).collection('messages').doc(msg.id);
            readBatch.update(docRef, {
              read: true,
              readAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            unreadFound = true;
          }

          const timeStr = msg.timestamp 
            ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            : 'Just now';

          if (isMe) {
            const tickHtml = msg.read 
              ? '<span title="Read" style="color:#93c5fd; font-weight:bold;">✓✓</span>' 
              : '<span title="Delivered" style="opacity:0.7;">✓</span>';

            html += `
              <div class="msg-row msg-sent">
                <div class="msg-bubble bubble-sent">
                  <div class="msg-text" style="white-space:pre-wrap;">${escapeHtml(msg.text)}</div>
                  <div class="msg-meta">
                    <span class="msg-time">${timeStr} ${tickHtml}</span>
                  </div>
                </div>
              </div>
            `;
          } else {
            const partnerInitials = (activeTargetName || 'U').slice(0, 1).toUpperCase();

            html += `
              <div class="msg-row msg-received">
                <div class="msg-sender-avatar">${partnerInitials}</div>
                <div class="msg-bubble bubble-received">
                  <div class="msg-text" style="white-space:pre-wrap;">${escapeHtml(msg.text)}</div>
                  <div class="msg-meta">
                    <span class="msg-time">${timeStr}</span>
                  </div>
                </div>
              </div>
            `;
          }
        });

        if (unreadFound) {
          readBatch.commit().catch(e => console.warn("Read receipts batch error:", e));
        }

        stream.innerHTML = html;
        stream.scrollTop = stream.scrollHeight;
      }, err => {
        console.error("Chat sync error:", err);
        if (stream) stream.innerHTML = '<div class="empty">✕ Sync timeout. Check internet connection.</div>';
      });
  }

  // 5. Send Message Controller
  async function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;

    const text = input.value.trim();
    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);

    if (!text || !activeRoomId || !currentUser) return;
    input.value = '';
    input.focus();

    const targetUid = activeTargetUid;
    const now = Date.now();
    const senderName = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User');

    const existingRoomIndex = allRoomsData.findIndex(r => r.roomId === activeRoomId);
    const updatedRoomObj = {
      roomId: activeRoomId,
      targetUid: targetUid,
      targetName: activeTargetName,
      lastMessage: text,
      lastSenderId: currentUser.uid,
      lastSenderName: senderName,
      lastUpdated: now,
      unreadCount: 0
    };

    if (existingRoomIndex >= 0) {
      allRoomsData.splice(existingRoomIndex, 1);
    }
    allRoomsData.unshift(updatedRoomObj);
    renderInboxList();

    try {
      await db.collection('chats').doc(activeRoomId).collection('messages').add({
        text: text,
        senderId: currentUser.uid,
        senderName: senderName,
        read: false,
        createdAt: now,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      const incrementPayload = {};
      if (targetUid) {
        incrementPayload[`unreadCounts.${targetUid}`] = firebase.firestore.FieldValue.increment(1);
      }

      const participantNamesPayload = {};
      participantNamesPayload[`participantNames.${currentUser.uid}`] = senderName;
      if (activeTargetName && targetUid) {
        participantNamesPayload[`participantNames.${targetUid}`] = activeTargetName;
      }

      await db.collection('chats').doc(activeRoomId).set({
        lastMessage: text,
        lastSenderId: currentUser.uid,
        lastSenderName: senderName,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdatedMillis: now,
        participants: [currentUser.uid, targetUid],
        ...participantNamesPayload,
        ...incrementPayload
      }, { merge: true });

    } catch (error) {
      console.error("Message send error:", error);
      if (typeof UI !== 'undefined') UI.showToast("Failed to send message: " + error.message, true);
    }
  }

  // 6. Direct Coordinator Chat Launcher (For Alumni)
  async function openCoordinatorChat(defaultTemplateText = '') {
    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);
    if (!currentUser) {
      UI.showToast('Please login to communicate with the coordinator.', true);
      return;
    }

    try {
      let coordinatorUid = null;
      let coordinatorName = 'College Placement Coordinator';

      // 1. Look up in admins collection
      const adminSnap = await db.collection('admins').limit(1).get();
      if (!adminSnap.empty) {
        coordinatorUid = adminSnap.docs[0].id;
        const d = adminSnap.docs[0].data();
        if (d && d.name) coordinatorName = d.name + ' (Coordinator)';
      }

      // 2. Fallback if no admin doc: check alumni directory for admin role
      if (!coordinatorUid) {
        const fallbackSnap = await db.collection('alumni').where('role', '==', 'admin').limit(1).get();
        if (!fallbackSnap.empty) {
          coordinatorUid = fallbackSnap.docs[0].id;
          coordinatorName = (fallbackSnap.docs[0].data().name || 'Coordinator') + ' (Coordinator)';
        }
      }

      if (!coordinatorUid) {
        coordinatorUid = 'coordinator_desk';
      }

      await openBox(coordinatorUid, coordinatorName);

      if (defaultTemplateText) {
        const input = document.getElementById('chatInput');
        if (input) {
          input.value = defaultTemplateText;
          input.focus();
        }
      }
    } catch (e) {
      console.error('Coordinator chat error:', e);
      UI.showToast('Could not open coordinator channel: ' + e.message, true);
    }
  }

  // Quick Chips Inside Chat
  function insertQuickTemplate(type) {
    const input = document.getElementById('chatInput');
    if (!input) return;

    if (type === 'job') {
      input.value = '💼 [Job Vacancy Referral]\n• Role: \n• Company: \n• Location: \n• CTC/Stipend: \n• Application Link / Contact: \n• Eligibility: ';
    } else if (type === 'internship') {
      input.value = '🎓 [Internship Lead]\n• Role: \n• Company: \n• Duration: \n• Stipend: \n• Application Link: ';
    } else if (type === 'referral') {
      input.value = '🤝 [Alumni Referral]\nHello Coordinator, our company is actively hiring graduates from our college. I can provide direct referrals for eligible students.';
    } else if (type === 'update') {
      input.value = '📢 [Institutional Notice / Feedback]\nDear Coordinator, ';
    }
    input.focus();
  }

  // Background Structured Messaging Helper
  async function sendStructuredMessage(senderUid, targetUid, text, senderName, targetName) {
    if (!senderUid || !targetUid || !text) return;
    const roomId = [senderUid, targetUid].sort().join('_');
    const now = Date.now();

    try {
      await db.collection('chats').doc(roomId).collection('messages').add({
        text,
        senderId: senderUid,
        senderName: senderName || 'Alumni',
        read: false,
        createdAt: now,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection('chats').doc(roomId).set({
        lastMessage: text,
        lastSenderId: senderUid,
        lastSenderName: senderName || 'Alumni',
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        lastUpdatedMillis: now,
        participants: [senderUid, targetUid],
        [`unreadCounts.${targetUid}`]: firebase.firestore.FieldValue.increment(1),
        [`participantNames.${senderUid}`]: senderName || 'Alumni',
        [`participantNames.${targetUid}`]: targetName || 'Coordinator'
      }, { merge: true });
    } catch (e) {
      console.warn('sendStructuredMessage error:', e);
    }
  }

  // System Notification Message
  async function sendSystemMessageToUser(targetUid, text) {
    const currentUser = APP.getUser();
    if (!currentUser || !targetUid) return;
    const senderUid = currentUser.uid;
    const senderName = currentUser.displayName || 'Placement Coordinator';
    sendStructuredMessage(senderUid, targetUid, text, senderName, 'Alumni');
  }

  // 7. User Picker Modal: Start New Chat
  function openNewChatModal() {
    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);
    if (!currentUser) return;

    const modal = document.getElementById('newChatModalOverlay');
    if (modal) modal.classList.add('open');

    const input = document.getElementById('newChatSearchInput');
    if (input) {
      input.value = '';
      input.focus();
    }

    renderNewChatUsers();
  }

  function closeNewChatModal() {
    const modal = document.getElementById('newChatModalOverlay');
    if (modal) modal.classList.remove('open');
  }

  function onNewChatSearch(query) {
    renderNewChatUsers(query);
  }

  async function renderNewChatUsers(filterQuery = '') {
    const container = document.getElementById('newChatUserList');
    if (!container) return;

    const currentUser = APP.getUser() || (firebase.auth && firebase.auth().currentUser);
    const currentUid = currentUser ? currentUser.uid : '';
    const userRole = APP.getRole();
    let alumniCache = window._fullAlumniCache || [];

    if (alumniCache.length === 0) {
      try {
        const snap = await db.collection('alumni').limit(50).get();
        alumniCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window._fullAlumniCache = alumniCache;
      } catch(e) {
        console.warn("Alumni list fetch error:", e);
      }
    }

    const query = filterQuery.toLowerCase().trim();

    // Pinned Coordinator Card for Alumni
    let coordinatorPinnedHtml = '';
    if (userRole === 'alumni' && (!query || 'coordinator placement admin help'.includes(query))) {
      coordinatorPinnedHtml = `
        <div class="user-select-row" style="background:linear-gradient(135deg, rgba(244,185,66,0.12) 0%, rgba(124,106,247,0.1) 100%); border:1px solid rgba(244,185,66,0.3); border-radius:var(--radius-sm); margin-bottom:8px;" onclick="CHAT.openCoordinatorChat()">
          <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
            <div class="avatar" style="background:rgba(244,185,66,0.25); color:var(--gold); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px;">👑</div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:6px;">
                <h4 style="font-size:14px; font-weight:700; color:var(--gold); margin:0;">Placement Coordinator / Admin</h4>
                <span class="role-label admin" style="margin:0;">Official</span>
              </div>
              <p style="font-size:12px; color:var(--muted); margin:2px 0 0;">Share job vacancies, internships & institutional notices</p>
            </div>
          </div>
          <span style="font-size:12px; color:var(--gold); font-weight:700;">Direct Reach ✉️</span>
        </div>
      `;
    }

    const users = alumniCache.filter(u => {
      const uId = u.id || u.uid;
      if (uId === currentUid || u.uid === currentUid) return false;
      if (!query) return true;
      return (u.name || '').toLowerCase().includes(query) ||
             (u.branch || '').toLowerCase().includes(query) ||
             (u.company || '').toLowerCase().includes(query) ||
             (u.usn || '').toLowerCase().includes(query) ||
             (u.year || '').toString().includes(query);
    });

    if (users.length === 0 && !coordinatorPinnedHtml) {
      container.innerHTML = `
        <div class="empty" style="padding:24px 0;">
          <div class="icon">🔍</div>
          <p>No members found matching "${escapeHtml(filterQuery)}".</p>
        </div>
      `;
      return;
    }

    const membersHtml = users.map(user => {
      const name = user.name || 'Alumni Member';
      const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      const statusBadge = user.status ? `<span class="opp-skill-tag" style="font-size:10px;">${escapeHtml(user.status)}</span>` : '';
      const subInfo = `${user.branch || ''} ${user.year ? '· ' + user.year : ''} ${user.company ? '· ' + user.company : ''}`.trim();

      const avatarHtml = user.avatarUrl
        ? `<img src="${user.avatarUrl}" class="avatar" style="object-fit: cover; width:40px; height:40px; border-radius:50%;">`
        : `<div class="avatar" style="background:var(--surface3); color:var(--accent2); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">${initials}</div>`;

      return `
        <div class="user-select-row" onclick="CHAT.openBox('${user.id || user.uid}', '${escapeHtml(name).replace(/'/g, "\\'")}')">
          <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
            ${avatarHtml}
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:6px;">
                <h4 style="font-size:14px; font-weight:600; color:var(--text); margin:0;">${escapeHtml(name)}</h4>
                ${statusBadge}
              </div>
              <p style="font-size:12px; color:var(--muted); margin:2px 0 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(subInfo || 'Member')}</p>
            </div>
          </div>
          <span style="font-size:12px; color:var(--accent2); font-weight:600;">Message 💬</span>
        </div>
      `;
    }).join('');

    container.innerHTML = coordinatorPinnedHtml + membersHtml;
  }

  function closeBox(e, force = false) {
    if (force || (e && e.target === document.getElementById('chatOverlay'))) {
      document.getElementById('chatOverlay').classList.remove('open');
      if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
      activeRoomId = null;
      activeTargetUid = null;
      activeTargetName = null;
      initInboxListener();
    }
  }

  function clearInbox() {
    if (inboxUnsubscribe) { inboxUnsubscribe(); inboxUnsubscribe = null; }
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
    initInboxListener,
    renderInboxList,
    onInboxSearch,
    openBox,
    openCoordinatorChat,
    insertQuickTemplate,
    sendStructuredMessage,
    sendSystemMessageToUser,
    sendMessage,
    closeBox,
    clearInbox,
    openNewChatModal,
    closeNewChatModal,
    onNewChatSearch
  };
})();