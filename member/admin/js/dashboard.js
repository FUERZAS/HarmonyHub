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

      // --- Load Upcoming Schedules from /schedules ---
      const schedulesContainer = document.querySelector(".schedules-container");
      if (schedulesContainer) {
        schedulesContainer.innerHTML = "";

        const schedules = Object.values(schedulesSnap.val() || {})
          .filter(s => new Date(s.start) >= new Date()) // only upcoming
          .sort((a, b) => new Date(a.start) - new Date(b.start));

        schedules.forEach(schedule => {
          const card = document.createElement("div");
          card.className = "schedule-card";

          // Format start and end
          const startDate = new Date(schedule.start);
          const endDate = new Date(schedule.end);
          const formattedStart = startDate.toLocaleDateString() + " " + startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const formattedEnd = endDate.toLocaleDateString() + " " + endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          card.innerHTML = `
            <div class="schedule-header">
              <h3 class="schedule-title">${schedule.title}</h3>
              <span class="schedule-time">${formattedStart} - ${formattedEnd}</span>
            </div>
            <div class="schedule-details">
              <div class="schedule-detail"><span>📌</span> Type: ${schedule.type}</div>
            </div>
          `;
          schedulesContainer.appendChild(card);
        });

        if (!schedules.length) {
          schedulesContainer.innerHTML = "<p class='no-data'>No upcoming schedules</p>";
        }
      }

      const activityList = document.querySelector(".activity-list");
      if (activityList) {
        activityList.innerHTML = "";

        const activitySnap = await db.ref("activity_table").orderByChild("timestamp").limitToLast(3).once("value");
        const activities = Object.values(activitySnap.val() || {}).sort((a, b) => b.timestamp - a.timestamp);

        activities.forEach(act => {
          const li = document.createElement("li");
          li.className = "activity-item";

          const time = new Date(act.timestamp).toLocaleString();

          li.innerHTML = `
            <div class="activity-icon">${act.icon || "ℹ️"}</div>
            <div class="activity-content">
              <h4 class="activity-title">${act.type || "Activity"}</h4>
              <p class="activity-time">${time}</p>
            </div>
          `;
          activityList.appendChild(li);
        });

        if (!activities.length) {
          activityList.innerHTML = "<li class='no-data'>No recent activity</li>";
        }
      }

      // --- Sidebar Toggle ---
      const sidebarToggle = document.querySelector(".sidebar-toggle");
      const sidebar = document.querySelector(".sidebar");
      if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
          sidebar.classList.toggle("mobile-collapsed");
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
