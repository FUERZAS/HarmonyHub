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

  // Assume we know user role from authUser (set in localStorage)
  const authUser = JSON.parse(localStorage.getItem("authUser")) || {};
  const userRole = authUser.role || "member";

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
      loadMoreAnnouncements();
    } else {
      announcementsList.innerHTML = `<p>No announcements available.</p>`;
    }
  });

  // Render announcement item (no action buttons)
  function createAnnouncementItem(announcement) {
    const item = document.createElement("div");
    item.classList.add("announcement-item");
    item.dataset.category = announcement.category || "general";
    item.dataset.priority = announcement.priority || "low";

    item.innerHTML = `
      <div class="announcement-header">
        <div class="priority-indicator ${announcement.priority || "low"}-priority"></div>
        <h4>${announcement.title}</h4>
        <span class="announcement-date">${new Date(
          announcement.date
        ).toLocaleString()}</span>
      </div>
      <div class="announcement-content">
        <p>${announcement.content}</p>
      </div>
    `;

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
});
