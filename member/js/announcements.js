// announcements.js
// Requires firebase-config.js (provides `database`) and SweetAlert2

document.addEventListener("DOMContentLoaded", () => {
  const announcementsRef = database.ref("announcements");

  // UI Elements
  const announcementsList = document.getElementById("announcements-container");
  const searchInput = document.getElementById("announcement-search");
  const priorityFilter = document.getElementById("priority-filter");
  const dateFilter = document.getElementById("date-filter");
  const loadMoreBtn = document.getElementById("load-more-btn");

  // Pagination control
  const PAGE_SIZE = 5;
  let allAnnouncements = [];
  let visibleAnnouncements = 0;
  let _filterTimer = null;

  // Read tracking for per-user unread state
  let readMap = {}; // { announcementId: true }
  let currentUid = null;

  // Assume we know user role from authUser (set in localStorage)
  const authUser = JSON.parse(localStorage.getItem("authUser")) || {};
  const userRole = authUser.role || "member";

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Listen for announcements (limit initial payload; we still filter client-side by audience)
  announcementsRef.orderByChild('timestamp').limitToLast(100).on("value", (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      allAnnouncements = Object.keys(data)
        .map((id) => ({ id, ...data[id] }))
        .filter((a) => {
          // Only show announcements visible to members
          const aud = a.audience || 'all_users';
          return aud === 'all_users' || aud === 'members_only';
        })
        .sort((a, b) => (Number(b.timestamp || 0) - Number(a.timestamp || 0)));

      visibleAnnouncements = 0;
      announcementsList.innerHTML = "";
  // Refresh current user's read map first so unread indicators are accurate
  ensureReadMap().then(() => loadMoreAnnouncements());
    } else {
      announcementsList.innerHTML = `<p>No announcements available.</p>`;
    }
  });

  // Keep track of signed-in user and their read announcements
  if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged((user) => {
      currentUid = user ? user.uid : null;
      ensureReadMap().then(() => {
        // refresh currently visible items so unread markers update
        announcementsList.innerHTML = '';
        visibleAnnouncements = 0;
        loadMoreAnnouncements();
      });
    });
  }

  async function ensureReadMap() {
    if (!currentUid) { readMap = {}; return; }
    try {
      const snap = await database.ref(`users/${currentUid}/readAnnouncements`).once('value');
      readMap = snap.val() || {};
    } catch (e) {
      console.warn('Could not load readAnnouncements for user', e);
      readMap = {};
    }
  }

  // Render announcement item (no action buttons)
  function createAnnouncementItem(announcement) {
    const item = document.createElement("div");
    item.classList.add("announcement-item");
    item.dataset.category = announcement.category || "general";
    item.dataset.priority = announcement.priority || "low";
  item.dataset.id = announcement.id || '';

    // If user hasn't read this announcement yet, mark visually
    try {
      const isRead = currentUid && readMap && readMap[announcement.id];
      if (!isRead) item.classList.add('unread');
    } catch (e) {
      // ignore
    }

    item.innerHTML = `
      <div class="announcement-header">
        <div class="priority-indicator ${announcement.priority || "low"}-priority"></div>
        <h4>${escapeHtml(announcement.title)}</h4>
        <span class="announcement-date">${new Date(
          announcement.date
        ).toLocaleString()}</span>
      </div>
      <div class="announcement-content">
        <p>${escapeHtml(announcement.content)}</p>
      </div>
    `;

    // Open preview when the item is clicked
    item.addEventListener('click', (e) => {
      // ignore clicks on internal interactive elements (future-proof)
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('.card-actions'))) return;
      openPreviewModal(announcement);
    });

    return item;
  }

  // Load more announcements
  function loadMoreAnnouncements() {
    const nextAnnouncements = allAnnouncements.slice(
      visibleAnnouncements,
      visibleAnnouncements + PAGE_SIZE
    );
    const frag = document.createDocumentFragment();
    nextAnnouncements.forEach((a) => frag.appendChild(createAnnouncementItem(a)));
    announcementsList.appendChild(frag);
    visibleAnnouncements += nextAnnouncements.length;

    if (visibleAnnouncements >= allAnnouncements.length) {
      loadMoreBtn.style.display = "none";
    } else {
      loadMoreBtn.style.display = "block";
    }
  }

  loadMoreBtn.addEventListener("click", loadMoreAnnouncements);

  // Filters
  function applyFilters() {
    if (_filterTimer) clearTimeout(_filterTimer);
    _filterTimer = setTimeout(() => {
      const search = (searchInput.value || '').toLowerCase();
      const priority = priorityFilter.value;
      const dateOption = dateFilter.value;

      const now = new Date();

      // build filtered list (don't mutate allAnnouncements)
      const filtered = allAnnouncements.filter((a) => {
        let matches = true;

        if (search) {
          const title = (a.title || '').toLowerCase();
          const content = (a.content || '').toLowerCase();
          if (!title.includes(search) && !content.includes(search)) matches = false;
        }

        if (priority !== 'all' && a.priority !== priority) matches = false;

        if (dateOption !== 'all') {
          const aDate = new Date(a.date || a.timestamp || Date.now());
          if (dateOption === 'today') {
            if (aDate.toDateString() !== now.toDateString()) matches = false;
          } else if (dateOption === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            if (aDate < weekAgo) matches = false;
          } else if (dateOption === 'month') {
            const monthAgo = new Date();
            monthAgo.setMonth(now.getMonth() - 1);
            if (aDate < monthAgo) matches = false;
          }
        }

        return matches;
      });

      // render filtered list (paged)
      announcementsList.innerHTML = '';
      const frag = document.createDocumentFragment();
      const page = filtered.slice(0, PAGE_SIZE);
      page.forEach(a => frag.appendChild(createAnnouncementItem(a)));
      announcementsList.appendChild(frag);

      visibleAnnouncements = page.length;
      loadMoreBtn.style.display = filtered.length > visibleAnnouncements ? 'block' : 'none';
    }, 120);
  }

  searchInput.addEventListener("input", applyFilters);
  priorityFilter.addEventListener("change", applyFilters);
  dateFilter.addEventListener("change", applyFilters);

  // ---------------- Preview modal & read tracking ----------------
  let _currentPreviewId = null;
  const announcementModalEl = document.getElementById('announcement-modal');
  const previewTitleEl = document.getElementById('preview-title');
  const previewDateEl = document.getElementById('preview-date');
  const previewDescriptionEl = document.getElementById('preview-description');
  const previewAuthorEl = document.getElementById('preview-author');
  const previewCategoryEl = document.getElementById('preview-category');
  const previewPriorityEl = document.getElementById('preview-priority');
  const modalMarkReadBtn = document.getElementById('modal-mark-read');

  function openPreviewModal(announcement) {
    if (!announcement) return;
    _currentPreviewId = announcement.id;
    if (previewTitleEl) previewTitleEl.textContent = announcement.title || 'Untitled';
    if (previewDateEl) previewDateEl.textContent = `Date: ${new Date(announcement.date || announcement.timestamp || Date.now()).toLocaleString()}`;
    if (previewDescriptionEl) previewDescriptionEl.textContent = announcement.content || '';
    // Prefer authorName, then author, then try to resolve via authorUid in the users node
    if (previewAuthorEl) {
      let authorText = announcement.authorName || announcement.author || 'Unknown';
      previewAuthorEl.textContent = `Posted by: ${authorText}`;

      // If we only have an authorUid (or authorText is Unknown), try to fetch user's name from DB
      if ((authorText === 'Unknown' || !authorText) && announcement.authorUid) {
        // show a loading placeholder while we fetch
        previewAuthorEl.textContent = `Posted by: Loading...`;
        database.ref(`users/${announcement.authorUid}`).once('value').then((snap) => {
          const u = snap.val();
          const resolved = u && (u.name || u.displayName || u.fullName);
          if (resolved) {
            previewAuthorEl.textContent = `Posted by: ${resolved}`;
          } else {
            previewAuthorEl.textContent = `Posted by: Unknown`;
          }
        }).catch((err) => {
          console.warn('Could not resolve announcement author name', err);
          previewAuthorEl.textContent = `Posted by: ${announcement.author || 'Unknown'}`;
        });
      }
    }
    if (previewCategoryEl) previewCategoryEl.textContent = `Category: ${announcement.category || 'General'}`;
    if (previewPriorityEl) previewPriorityEl.textContent = `Priority: ${announcement.priority || 'low'}`;

    // Show modal
    if (announcementModalEl) announcementModalEl.style.display = 'flex';

    // increment views counter (best-effort, using transaction)
    try { incrementViews(_currentPreviewId); } catch (e) { console.warn('Could not increment views', e); }
  }

  function closePreviewModal() {
    if (announcementModalEl) announcementModalEl.style.display = 'none';
    _currentPreviewId = null;
  }

  function incrementViews(id) {
    if (!id) return;
    const ref = announcementsRef.child(id).child('views');
    ref.transaction((v) => {
      return (v || 0) + 1;
    }).catch(err => console.warn('Views transaction failed', err));
  }

  async function markCurrentAsRead() {
    const id = _currentPreviewId;
    if (!id || !currentUid) return;
    try {
      await database.ref(`users/${currentUid}/readAnnouncements/${id}`).set(true);
      // update local map and UI
      readMap[id] = true;
      const el = announcementsList.querySelector(`.announcement-item[data-id='${id}'], .announcement-item[data-id="${id}"]`);
      if (el) el.classList.remove('unread');
      // also close modal for better UX
      closePreviewModal();
      // notify other parts of the UI (dashboard) that an announcement was marked read
      try { window.dispatchEvent(new CustomEvent('announcementMarkedRead', { detail: { id } })); } catch (e) {}
    } catch (e) {
      console.warn('Failed to mark as read', e);
    }
  }

  // wire modal close buttons
  document.querySelectorAll('.close-modal, .announcement-modal .close-modal').forEach(btn => {
    btn.addEventListener('click', () => closePreviewModal());
  });

  if (modalMarkReadBtn) modalMarkReadBtn.addEventListener('click', markCurrentAsRead);
});
