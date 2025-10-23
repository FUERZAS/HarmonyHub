// /admin/js/dashboard.js

document.addEventListener("DOMContentLoaded", () => {
  const auth = firebase.auth();
  const db = firebase.database();

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "../index.html";
      return;
    }

    try {
      // --- Fetch User Info ---
      const snapshot = await db.ref(`users/${user.uid}`).once("value");
      const data = snapshot.val();
      if (!data) throw new Error("User data not found!");

      const role = data.role || "member";
      const displayName = data.displayName || "User";

      // --- Update Sidebar User Info ---
      const avatarEl = document.querySelector(".user-avatar");
      const nameEl = document.querySelector(".user-name");
      const roleEl = document.querySelector(".user-role");

      if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
      if (nameEl) nameEl.textContent = displayName;
      if (roleEl) roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

      // --- Fetch Stats in Parallel ---
      const [usersSnap, schedulesSnap, resourcesSnap, meetingsSnap] = await Promise.all([
        db.ref("users").once("value"),
        db.ref("schedules").once("value"),
        db.ref("resources").once("value"),
        db.ref("meetings").once("value")
      ]);

      const today = new Date().toDateString();
      const totalUsers = usersSnap.numChildren();
      const totalSchedulesToday = Object.values(schedulesSnap.val() || {}).filter(s => {
        const startDate = new Date(s.start);
        return startDate.toDateString() === today;
      }).length;
      const totalResources = resourcesSnap.numChildren();
      const liveMeetings = Object.values(meetingsSnap.val() || {}).filter(m => m.status === "live").length;

      const statsMap = {
        ".stat-card:nth-child(1) .stat-value": totalUsers,
        ".stat-card:nth-child(2) .stat-value": totalSchedulesToday,
        ".stat-card:nth-child(3) .stat-value": totalResources,
        ".stat-card:nth-child(4) .stat-value": liveMeetings
      };

      Object.entries(statsMap).forEach(([selector, value]) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = value;
      });

      // --- Live rendering controls for schedules & activity ---
      const schedulesContainer = document.querySelector(".schedules-container");
      const activityList = document.querySelector(".activity-list");
      const schedulesRenderLimit = 6; // show next 6 by default
      let schedulesShowingAll = false;
      const activityRenderLimit = 3; // show latest 3 by default
      let activityShowingAll = false;
      let _schedulesTimer = null;
      let _activityTimer = null;

      // --- Live Upcoming Schedules (realtime, debounced, batched) ---
      if (schedulesContainer) {
        // helper to render schedules list
        function renderSchedulesList(items) {
          if (_schedulesTimer) clearTimeout(_schedulesTimer);
          _schedulesTimer = setTimeout(() => {
            schedulesContainer.innerHTML = '';
            const frag = document.createDocumentFragment();
            const toRender = schedulesShowingAll ? items : items.slice(0, schedulesRenderLimit);

            toRender.forEach(schedule => {
              const card = document.createElement('div');
              card.className = 'schedule-card';
              const startDate = schedule.start ? new Date(schedule.start) : null;
              const endDate = schedule.end ? new Date(schedule.end) : null;
              const formattedStart = startDate ? startDate.toLocaleString() : 'TBD';
              const formattedEnd = endDate ? endDate.toLocaleString() : 'TBD';

              card.innerHTML = `
                <div class="schedule-header">
                  <h3 class="schedule-title">${schedule.title || 'Untitled'}</h3>
                  <span class="schedule-time">${formattedStart} - ${formattedEnd}</span>
                </div>
                <div class="schedule-details">
                  <div class="schedule-detail"><span>📌</span> Type: ${schedule.type || 'General'}</div>
                </div>
              `;
              frag.appendChild(card);
            });

            schedulesContainer.appendChild(frag);

            // show-more control
            const existing = document.getElementById('schedules-show-more');
            if (existing) existing.remove();
            if (items.length > schedulesRenderLimit) {
              const more = document.createElement('div');
              more.id = 'schedules-show-more';
              more.className = 'show-more';
              more.textContent = schedulesShowingAll ? 'Show less' : `Show more (${items.length - schedulesRenderLimit})`;
              more.style.cursor = 'pointer';
              more.addEventListener('click', () => {
                schedulesShowingAll = !schedulesShowingAll;
                renderSchedulesList(items);
              });
              schedulesContainer.appendChild(more);
            }
          }, 80);
        }

        // Attach a realtime listener to schedules and compute upcoming items
        db.ref('schedules').orderByChild('start').on('value', (snap) => {
          const raw = snap.val() || {};
          const now = Date.now();
          const items = Object.keys(raw).map(k => ({ id: k, ...raw[k] }))
            .filter(s => {
              const t = s.start ? new Date(s.start).getTime() : 0;
              return t >= now - 1000; // include near-future; allow small clock skews
            })
            .sort((a,b) => new Date(a.start) - new Date(b.start));

          if (!items.length) {
            schedulesContainer.innerHTML = "<p class='no-data'>No upcoming schedules</p>";
            return;
          }
          renderSchedulesList(items);
        });
      }

      // --- Live Recent Activity (realtime, debounced, batched) ---
      if (activityList) {
        function renderActivity(items) {
          if (_activityTimer) clearTimeout(_activityTimer);
          _activityTimer = setTimeout(() => {
            activityList.innerHTML = '';
            const frag = document.createDocumentFragment();
            const toRender = activityShowingAll ? items : items.slice(0, activityRenderLimit);

            toRender.forEach(act => {
              const li = document.createElement('li');
              li.className = 'activity-item';
              const time = act.timestamp ? new Date(act.timestamp).toLocaleString() : '';
              li.innerHTML = `
                <div class="activity-icon">${act.icon || 'ℹ️'}</div>
                <div class="activity-content">
                  <h4 class="activity-title">${act.type || 'Activity'}</h4>
                  <p class="activity-time">${time}</p>
                </div>
              `;
              frag.appendChild(li);
            });

            activityList.appendChild(frag);

            const existing = document.getElementById('activity-show-more');
            if (existing) existing.remove();
            if (items.length > activityRenderLimit) {
              const more = document.createElement('div');
              more.id = 'activity-show-more';
              more.className = 'show-more';
              more.textContent = activityShowingAll ? 'Show less' : `Show more (${items.length - activityRenderLimit})`;
              more.style.cursor = 'pointer';
              more.addEventListener('click', () => {
                activityShowingAll = !activityShowingAll;
                renderActivity(items);
              });
              activityList.appendChild(more);
            }
          }, 80);
        }

        // Listen to last N activity items and render newest-first
        db.ref('activity_table').orderByChild('timestamp').limitToLast(50).on('value', (snap) => {
          const raw = snap.val() || {};
          const items = Object.keys(raw).map(k => ({ id: k, ...raw[k] }))
            .sort((a,b) => b.timestamp - a.timestamp);

          if (!items.length) {
            activityList.innerHTML = "<li class='no-data'>No recent activity</li>";
            return;
          }
          renderActivity(items);
        });
      }

      // ...existing code... (sidebar toggle handled in admin/js/base.js)

      // --- Quick Actions ---
      const qaNewUser = document.getElementById('qa-new-user');
      const qaNewResource = document.getElementById('qa-new-resource');
      const qaNewSchedule = document.getElementById('qa-new-schedule');
      const qaAnnouncement = document.getElementById('qa-send-announcement');

  // badge elements
  const badgeNewUser = document.getElementById('badge-new-user');
  const badgeNewResource = document.getElementById('badge-new-resource');
  const badgeNewSchedule = document.getElementById('badge-new-schedule');
  const badgeNewAnnouncement = document.getElementById('badge-new-announcement');

      if (qaNewUser) qaNewUser.addEventListener('click', () => { window.location.href = 'user-management.html'; });
      if (qaNewResource) qaNewResource.addEventListener('click', () => { window.location.href = 'resources.html'; });
      if (qaNewSchedule) qaNewSchedule.addEventListener('click', () => { window.location.href = 'schedules.html'; });
      if (qaAnnouncement) qaAnnouncement.addEventListener('click', () => { window.location.href = 'announcements.html'; });

      // --- Populate badge counts (pending items) ---
      // Users: pending = !isVerified
      try {
        firebase.database().ref('users').once('value').then(snap => {
          const users = snap.val() || {};
          const list = Object.values(users);
          const pending = list.filter(u => !u.isVerified).length;
          if (badgeNewUser) badgeNewUser.textContent = pending;
        }).catch(()=>{ if(badgeNewUser) badgeNewUser.textContent = 0; });

        // Resources: look for 'status' or 'approved' field; treat missing as approved
        firebase.database().ref('resources').once('value').then(snap => {
          const resources = snap.val() || {};
          const list = Object.values(resources);
          const pending = list.filter(r => (r.status && r.status.toLowerCase() === 'pending') || (r.approved === false)).length;
          if (badgeNewResource) badgeNewResource.textContent = pending;
        }).catch(()=>{ if(badgeNewResource) badgeNewResource.textContent = 0; });

        // Schedules: check for status 'pending' or a field 'isApproved'
        firebase.database().ref('schedules').once('value').then(snap => {
          const schedules = snap.val() || {};
          const list = Object.values(schedules);
          const pending = list.filter(s => (s.status && s.status.toLowerCase() === 'pending') || (s.isApproved === false)).length;
          if (badgeNewSchedule) badgeNewSchedule.textContent = pending;
        }).catch(()=>{ if(badgeNewSchedule) badgeNewSchedule.textContent = 0; });

        // Announcements: check for draft/pending
        firebase.database().ref('announcements').once('value').then(snap => {
          const notes = snap.val() || {};
          const list = Object.values(notes);
          const pending = list.filter(a => (a.status && a.status.toLowerCase() === 'pending') || (a.published === false)).length;
          if (badgeNewAnnouncement) badgeNewAnnouncement.textContent = pending;
        }).catch(()=>{ if(badgeNewAnnouncement) badgeNewAnnouncement.textContent = 0; });
      } catch (e) {
        // If firebase not available or an error occurs, set badges to 0
        if (badgeNewUser) badgeNewUser.textContent = 0;
        if (badgeNewResource) badgeNewResource.textContent = 0;
        if (badgeNewSchedule) badgeNewSchedule.textContent = 0;
        if (badgeNewAnnouncement) badgeNewAnnouncement.textContent = 0;
      }

      // --- Dashboard Search (client-side lightweight filter) ---
      const dashboardSearch = document.getElementById('dashboard-search');
      if (dashboardSearch) {
        dashboardSearch.addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();

          // Filter activity list items
          const activityItems = document.querySelectorAll('.activity-list .activity-item');
          activityItems.forEach(item => {
            const text = item.innerText.toLowerCase();
            item.style.display = q && !text.includes(q) ? 'none' : '';
          });

          // Filter schedules by title
          const scheduleCards = document.querySelectorAll('.schedules-container .schedule-card');
          scheduleCards.forEach(card => {
            const title = (card.querySelector('.schedule-title') || {}).innerText || '';
            card.style.display = q && !title.toLowerCase().includes(q) ? 'none' : '';
          });
        });
      }

      // --- Logout ---
      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
          auth.signOut().then(() => window.location.href = "../index.html");
        });
      }

    } catch (err) {
      console.error(err);
      Swal.fire("Unauthorized", err.message, "error");
      setTimeout(() => window.location.href = "../index.html", 2000);
    }
  });
});
