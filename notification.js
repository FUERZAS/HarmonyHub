// ===================== ADMIN GENERAL NOTIFICATIONS =====================
document.addEventListener("DOMContentLoaded", () => {
    const notifBtn = document.getElementById("notification-btn");
    const notifDropdown = document.getElementById("notifications-dropdown");
    const notifList = document.getElementById("notifications-list");
    const notifTabs = document.querySelectorAll(".notif-tab");

    // Badge element (numeric badge)
    const badge = document.createElement("span");
    badge.classList.add("badge");
    badge.style.minWidth = "20px";
    badge.style.height = "20px";
    badge.style.borderRadius = "999px";
    badge.style.backgroundColor = "#ff5252";
    badge.style.color = "#fff";
    badge.style.fontWeight = "700";
    badge.style.fontSize = "12px";
    badge.style.display = "none"; // hidden by default
    badge.style.lineHeight = "20px";
    badge.style.textAlign = "center";
    badge.style.padding = "0 6px";
    badge.style.marginLeft = "8px";
    notifBtn.appendChild(badge);

    // Globals
    let currentUser = null;
    let canSeeRegistration = false;
    let allNotifications = [];
    let renderLimit = 8; // default number of notifications to show
    let showingAll = false;
    let lastFilter = 'all';

    // ================= ROLE & PERMISSION HELPERS =================
    function isAdmin(user) { return user?.role === "admin"; }
    function isStaff(user) { return user?.role === "staff"; }
    function isMember(user) { return user?.role === "member"; }
    function hasPermission(user, key) { return !!user?.permissions?.[key]; }
    function canAccessUserManagement(user) { 
        return (isAdmin(user) || isStaff(user)) && hasPermission(user, "canVerifyUsers"); 
    }

    // ================= AUTH + PERMISSION CHECK =================
    auth.onAuthStateChanged((user) => {
        if (!user) return;

        database.ref(`users/${user.uid}`).once("value").then((snap) => {
            const userData = snap.val();
            if (!userData) return;

            currentUser = { uid: user.uid, ...userData };
            canSeeRegistration = canAccessUserManagement(currentUser);

            loadNotifications();
        });
    });

    // ================= LOAD NOTIFICATIONS =================
    function loadNotifications() {
        // Choose which channels to listen to based on role to reduce noise for members
        const channelRefs = [];
        // public channel is always useful
        channelRefs.push(database.ref('notifications/public'));
        if (isStaff(currentUser) || isAdmin(currentUser)) {
            channelRefs.push(database.ref('notifications/staff'));
        }
        if (isAdmin(currentUser)) {
            channelRefs.push(database.ref('notifications/admin'));
        }

        // activity_table is the authoritative fallback; listen but filter items by visibility
        database.ref('activity_table').on('value', (snapshot) => {
            const data = snapshot.val() || {};
            updateAllNotificationsFromData(data);
        });

        // Listen to selected dedicated channels only
        channelRefs.forEach((ref) => {
            ref.on('value', (snap) => {
                const d = snap.val() || {};
                mergeNotifications(d);
            });
        });
    }

    // Central visibility check to filter notifications early
    function isNotificationVisibleToUser(notif) {
        if (!notif) return false;
        // audience property (optional): 'public'|'staff'|'admin'|'members'
        const aud = notif.audience || 'public';
        if (aud === 'admin' && !isAdmin(currentUser)) return false;
        if (aud === 'staff' && !(isStaff(currentUser) || isAdmin(currentUser))) return false;
        if (aud === 'members' && !(isMember(currentUser) || isStaff(currentUser) || isAdmin(currentUser))) return false;

        switch (notif.type) {
            case 'registration':
                return canSeeRegistration;
            case 'resource_upload':
                return canViewResource(notif);
            case 'announcement':
                return true;
            case 'schedule':
                return true;
            case 'meeting':
                return true;
            default:
                return false;
        }
    }

    function updateAllNotificationsFromData(data) {
        allNotifications = Object.entries(data).map(([id, notif]) => ({
            id,
            ...notif,
            timestamp: unifyTimestamp(notif)
        })).filter(n => isNotificationVisibleToUser(n));
        scheduleRender();
    }

    function mergeNotifications(data) {
        // merge items from channel nodes into allNotifications by id
        const items = Object.entries(data).map(([id, notif]) => ({ id, ...notif, timestamp: unifyTimestamp(notif) }));
        const map = new Map(allNotifications.map(n => [n.id, n]));
        items.forEach(it => {
            const merged = { ...it };
            if (isNotificationVisibleToUser(merged)) {
                map.set(it.id, merged);
            }
        });
        allNotifications = Array.from(map.values()).filter(n => isNotificationVisibleToUser(n));
        scheduleRender();
    }

    function unifyTimestamp(notif) {
        return notif.timestamp ? notif.timestamp : (notif.createdAt ? new Date(notif.createdAt).getTime() : (notif.date ? new Date(notif.date).getTime() : 0));
    }

    // debounce rendering to avoid frequent DOM thrash when many updates arrive
    let _renderTimer = null;
    function scheduleRender() {
        if (_renderTimer) clearTimeout(_renderTimer);
        _renderTimer = setTimeout(() => { renderNotifications(document.querySelector('.notif-tab.active')?.dataset.tab || 'all'); }, 120);
    }

    // ================= RENDER NOTIFICATIONS =================
    function renderNotifications(filter = "all") {
        notifList.innerHTML = "";
        let filtered = [...allNotifications];

        if (filter === "unread") {
            filtered = filtered.filter(n => !n.readBy || !n.readBy[currentUser.uid]);
        }

        // 🔥 Sort newest → oldest by timestamp (unified)
        filtered.sort((a, b) => b.timestamp - a.timestamp);

        if (filtered.length === 0) {
            notifList.innerHTML = `<p class="no-notifs">No notifications</p>`;
            resetBadge();
            return;
        }

        const total = filtered.length;
        const toRender = showingAll ? filtered : filtered.slice(0, renderLimit);

        toRender.forEach((notif) => {
            switch (notif.type) {
                case "registration":
                    if (canSeeRegistration) renderRegistrationNotif(notif);
                    break;
                case "resource_upload":
                    renderResourceNotif(notif);
                    break;
                case "announcement":
                    renderAnnouncementNotif(notif);
                    break;
                case "schedule":
                    renderScheduleNotif(notif);
                    break;
                case "meeting":
                    renderMeetingNotif(notif);
                    break;
                default:
                    console.warn("Unknown notif type:", notif);
            }
        });

        // add show-more control if there are more notifications than the limit
        if (total > renderLimit) {
            const more = document.createElement('div');
            more.className = 'show-more';
            more.textContent = showingAll ? `Show less` : `Show more (${total - renderLimit})`;
            notifList.appendChild(more);
        }

        updateBadge();
    }

    // ================= REGISTRATION NOTIFICATION =================
    function renderRegistrationNotif(data) {
        const isUnread = !data.readBy || !data.readBy[currentUser.uid];
        const notifItem = document.createElement("div");
        notifItem.className = `notif-item ${isUnread ? "unread" : ""}`;
        notifItem.id = `notif-${data.id}`;

        let actionsHtml = "";
        if (!data.solved) {
            actionsHtml = `<div class="notif-actions"><button class="notif-approve">Verify Account</button></div>`;
        } else {
            actionsHtml = data.verifiedBy
                ? `<div class="notif-status">✅ Verified by ${data.verifiedBy} on ${new Date(data.verificationDate).toLocaleString()}</div>`
                : `<div class="notif-status">✔️ Solved</div>`;
        }

        const displayName = data.name || 'Unknown User';
        const avatarInitial = (displayName && displayName.length) ? displayName.charAt(0).toUpperCase() : '?';

        notifItem.innerHTML = `
            <div class="notif-avatar">${avatarInitial}</div>
            <div class="notif-content">
                <strong>${displayName}</strong>
                <small>${data.email || ''}</small><br>
                <small>${new Date(data.timestamp).toLocaleString()}</small>
                ${actionsHtml}
            </div>
        `;

        notifItem.addEventListener("click", () => {
            markAsRead(data.id);
            window.location.href = "user-management.html";
        });

        if (!data.solved) {
            notifItem.querySelector(".notif-approve").addEventListener("click", (e) => {
                e.stopPropagation();
                const verificationDate = new Date().toISOString();

                database.ref(`users/${data.userId}`).update({ isVerified: true, verificationDate });
                database.ref(`activity_table/${data.id}`).update({
                    isVerified: true,
                    verifiedBy: currentUser?.name || 'Unknown',
                    verificationDate,
                    solved: true
                });
                database.ref(`activity_table/${data.id}/readBy/${currentUser.uid}`).set(true);

                Swal.fire("✅ Verified", `${data.name} is now verified.`, "success");
            });
        }

        notifList.prepend(notifItem);
    }

    // ================= RESOURCE NOTIFICATION =================
    function renderResourceNotif(data) {
        const isUnread = !data.readBy || !data.readBy[currentUser.uid];
        const access = data.accessLevel || "public";
        if (!canViewResource(data)) return;

        const notifItem = document.createElement("div");
        notifItem.className = `notif-item ${isUnread ? "unread" : ""}`;
        notifItem.id = `notif-${data.id}`;

        database.ref(`users/${data.uploadedBy}/name`).once("value").then((snap) => {
            const uploaderName = snap.val() || "Unknown User";
            notifItem.innerHTML = `
                <div class="notif-avatar">📘</div>
                <div class="notif-content">
                    <strong>New Resource Uploaded</strong><br>
                    <small>📄 ${data.resourceName || "Unnamed Resource"}</small><br>
                    <small>👤 Uploaded by ${uploaderName}</small><br>
                    <small>🔑 Access: ${access}</small><br>
                    <small>🕒 ${new Date(data.timestamp).toLocaleString()}</small>
                </div>
            `;
            notifItem.addEventListener("click", () => {
                markAsRead(data.id);
                window.location.href = "resources.html";
            });
            notifList.prepend(notifItem);
        });
    }

    // ================= ANNOUNCEMENT NOTIFICATION =================
    function renderAnnouncementNotif(data) {
        const isUnread = !data.readBy || !data.readBy[currentUser.uid];
        const notifItem = document.createElement("div");
        notifItem.className = `notif-item ${isUnread ? "unread" : ""}`;
        notifItem.id = `notif-${data.id}`;

        notifItem.innerHTML = `
            <div class="notif-avatar">📢</div>
            <div class="notif-content">
                <strong>Announcement:</strong> ${data.title}<br>
                <small>${new Date(data.timestamp).toLocaleString()}</small>
            </div>
        `;

        notifItem.addEventListener("click", () => {
            markAsRead(data.id);
            window.location.href = "announcements.html";
        });

        notifList.prepend(notifItem);
    }

    // ================= SCHEDULE NOTIFICATION =================
    function renderScheduleNotif(data) {
        const isUnread = !data.readBy || !data.readBy[currentUser.uid];
        let icon = "📅", color = "#6c5ce7";

        switch ((data.scheduleType || "").toLowerCase()) {
            case "meeting": icon = "📘"; color = "#0984e3"; break;
            case "performance": icon = "📅"; color = "#00b894"; break;
            case "activity": icon = "📝"; color = "#e17055"; break;
        }

        const notifItem = document.createElement("div");
        notifItem.className = `notif-item ${isUnread ? "unread" : ""}`;
        notifItem.id = `notif-${data.id}`;
        notifItem.innerHTML = `
            <div class="notif-avatar" style="background:${color};">${icon}</div>
            <div class="notif-content">
                <strong>${data.title}</strong><br>
                <small>📌 Type: ${data.scheduleType || "General"}</small><br>
                <small>🕒 Start: ${new Date(data.start).toLocaleString()}</small><br>
                <small>🕒 End: ${data.end ? new Date(data.end).toLocaleString() : "N/A"}</small>
            </div>
        `;

        notifItem.addEventListener("click", () => {
            markAsRead(data.id);
            window.location.href = "schedules.html";
        });

        notifList.prepend(notifItem);
    }

    // ================= MEETING NOTIFICATION =================
    function renderMeetingNotif(data) {
        const isUnread = !data.readBy || !data.readBy[currentUser.uid];
        const notifItem = document.createElement("div");
        notifItem.className = `notif-item ${isUnread ? "unread" : ""}`;
        notifItem.id = `notif-${data.id}`;

        notifItem.innerHTML = `
            <div class="notif-avatar">📘</div>
            <div class="notif-content">
                <strong>Meeting Scheduled</strong><br>
                <small>Meeting ID: ${data.meetingId}</small><br>
                <small>Passcode: ${data.passcode}</small><br>
                <small>Date: ${data.date}</small><br>
                <small>Time: ${data.time}</small><br>
                <small>Created by: ${data.createdBy}</small><br>
                <button class="join-meeting-btn">Join Meeting</button>
            </div>
        `;

        notifItem.querySelector(".join-meeting-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            window.open(`https://zoom.us/j/${data.meetingId}?pwd=${data.passcode}`, "_blank");
        });

        notifItem.addEventListener("click", () => markAsRead(data.id));

        notifList.prepend(notifItem);
    }

    // ================= READ-BY LOGIC =================
    function markAsRead(activityId) {
        if (!currentUser) return;
        database.ref(`activity_table/${activityId}/readBy/${currentUser.uid}`).set(true);
        updateBadge();
    }

    // ================= BADGE HANDLING =================
    function updateBadge() {
        if (!currentUser) return;
        const visibleUnreadCount = allNotifications.filter(n => {
            const canSee =
                (n.type === "registration" && canSeeRegistration) ||
                (n.type === "resource_upload" && canViewResource(n)) ||
                (n.type === "announcement") ||
                (n.type === "schedule") ||
                (n.type === "meeting");
            return canSee && (!n.readBy || !n.readBy[currentUser.uid]);
        }).length;
        if (visibleUnreadCount > 0) {
            badge.textContent = visibleUnreadCount > 99 ? '99+' : String(visibleUnreadCount);
            badge.style.display = "inline-block";
        } else {
            badge.textContent = '';
            badge.style.display = "none";
        }
    }

    function canViewResource(data) {
        const access = data.accessLevel || "public";
        return isAdmin(currentUser) ||
            (isStaff(currentUser) && (access === "public" || access === "staff")) ||
            (isMember(currentUser) && (access === "public" || access === "members"));
    }

    function resetBadge() { badge.style.display = "none"; }

    // write read flag to activity_table and notification channels (best-effort)
    function setReadFlag(id) {
        if (!currentUser) return;
        const uid = currentUser.uid;
        try {
            database.ref(`activity_table/${id}/readBy/${uid}`).set(true);
            database.ref(`notifications/public/${id}/readBy/${uid}`).set(true);
            database.ref(`notifications/staff/${id}/readBy/${uid}`).set(true);
            database.ref(`notifications/admin/${id}/readBy/${uid}`).set(true);
        } catch (err) {
            console.warn('Failed to set read flag for', id, err);
        }
    }

    // Mark all currently visible (and allowed) unread notifications as read
    function markAllRead() {
        if (!currentUser) return;
        const filter = lastFilter || 'all';
        let visible = [...allNotifications];
        if (filter === 'unread') {
            visible = visible.filter(n => !n.readBy || !n.readBy[currentUser.uid]);
        }
        // apply sort and limit to determine which are visible in the UI
        visible.sort((a, b) => b.timestamp - a.timestamp);
        const toMark = showingAll ? visible : visible.slice(0, renderLimit);
        toMark.forEach(n => {
            // only mark those the user can see
            const canSee =
                (n.type === "registration" && canSeeRegistration) ||
                (n.type === "resource_upload" && canViewResource(n)) ||
                (n.type === "announcement") ||
                (n.type === "schedule") ||
                (n.type === "meeting");
            if (canSee && (!n.readBy || !n.readBy[currentUser.uid])) {
                setReadFlag(n.id);
                // optimistic local update
                n.readBy = n.readBy || {};
                n.readBy[currentUser.uid] = true;
            }
        });
        updateBadge();
        // re-render to clear unread styles
        renderNotifications(filter);
    }

    // ================= TAB SWITCHING =================
    notifTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            notifTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            renderNotifications(tab.dataset.tab);
        });
    });

    // ================= DROPDOWN TOGGLE =================
    if (notifBtn && notifDropdown) {
        notifBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            notifDropdown.style.display = notifDropdown.style.display === "flex" ? "none" : "flex";
        });

        document.addEventListener("click", (e) => {
            if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
                notifDropdown.style.display = "none";
            }
        });
    }

    // delegated click handling for dynamic elements inside the notifications list
    notifList.addEventListener('click', (e) => {
        const more = e.target.closest('.show-more');
        if (more) {
            showingAll = !showingAll;
            renderNotifications(lastFilter);
            return;
        }
    });

    // Bind mark-all-read button if present in the DOM
    const markAllBtn = document.querySelector('.notif-mark-all');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            markAllRead();
            Swal.fire('Marked', 'Visible notifications marked as read', 'success');
        });
    }
});
