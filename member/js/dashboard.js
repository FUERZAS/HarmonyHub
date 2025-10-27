// dashboard.js — Harmony Hub Member Dashboard

document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.database();
    const userData = JSON.parse(sessionStorage.getItem('authUser'));

    // Elements
    const memberNameEl = document.getElementById('member-name');
    const upcomingEventsEl = document.getElementById("upcoming-events");
    const resourcesCountEl = document.getElementById('resources-count');
    const meetingsCountEl = document.getElementById('meetings-count');
    const announcementsCountEl = document.getElementById('announcements-count');
    const activityListEl = document.getElementById('activity-list');
    const eventsListEl = document.getElementById('events-list');

    const notificationBtn = document.getElementById('notification-btn');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const notifTabs = document.querySelectorAll('.notif-tab');
    const notificationsListEl = document.getElementById('notifications-list');

    // ========================= WELCOME SECTION =========================
    if (userData && userData.name) {
        memberNameEl.textContent = userData.name.split(' ')[0];
    }

    // ========================= DASHBOARD COUNTS =========================
    function loadDashboardCounts() {
        // Count events
        db.ref('events').once('value').then(snapshot => {
            const total = snapshot.exists() ? snapshot.numChildren() : 0;
            upcomingEventsEl.textContent = total;
        });

        // Count resources
        db.ref('resources').once('value').then(snapshot => {
            const total = snapshot.exists() ? snapshot.numChildren() : 0;
            resourcesCountEl.textContent = total;
        });

        // Count meetings
        db.ref('meetings').once('value').then(snapshot => {
            const total = snapshot.exists() ? snapshot.numChildren() : 0;
            meetingsCountEl.textContent = total;
        });

        // Count announcements
        // Prefer showing unread announcements for the signed-in user
        (async () => {
            try {
                const snap = await db.ref('announcements').once('value');
                const announcements = snap.val() || {};
                const authUserId = (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : (userData && userData.uid) ? userData.uid : null;
                if (!authUserId) {
                    // fallback to total
                    announcementsCountEl.textContent = Object.keys(announcements).length;
                    return;
                }

                const readSnap = await db.ref(`users/${authUserId}/readAnnouncements`).once('value');
                const readMap = readSnap.val() || {};

                let unread = 0;
                Object.entries(announcements).forEach(([id, ann]) => {
                    if (!ann) return;
                    if (ann.status && ann.status !== 'published') return; // only count published
                    const aud = ann.audience || 'all_users';
                    // visible to members
                    if (aud !== 'all_users' && aud !== 'members_only') return;
                    if (!readMap[id]) unread++;
                });
                announcementsCountEl.textContent = unread;
            } catch (e) {
                console.warn('Could not compute unread announcements', e);
                // fallback
                db.ref('announcements').once('value').then(snapshot => {
                    const total = snapshot.exists() ? snapshot.numChildren() : 0;
                    announcementsCountEl.textContent = total;
                });
            }
        })();
    }

    // Listen for announcement read events to keep count in sync
    window.addEventListener('announcementMarkedRead', (e) => {
        try {
            const el = announcementsCountEl;
            if (!el) return;
            const cur = parseInt(el.textContent || '0', 10);
            if (!isNaN(cur) && cur > 0) el.textContent = (cur - 1).toString();
        } catch (err) { /* ignore */ }
    });

    // Recent activity optimization:
    // - Read from a single `activity_table` node (if available) to reduce reads
    // - Batch DOM updates via DocumentFragment
    // - Render a small number of items inline (renderLimit) and provide "Show more" control
    const activityRenderLimit = 3;
    let activityShowingAll = false;
    let _activityRefreshTimer = null;

    function loadRecentActivity() {
        // Debounce quick successive calls
        if (_activityRefreshTimer) clearTimeout(_activityRefreshTimer);
        _activityRefreshTimer = setTimeout(() => {
            // Prefer canonical activity_table that aggregates events from multiple sources
            const ref = firebase.database().ref('activity_table');
            ref.orderByChild('timestamp').limitToLast(50).once('value').then(snapshot => {
                const activities = [];
                snapshot.forEach(child => {
                    const data = child.val();
                    if (!data) return;
                    const ts = data.timestamp ? Number(data.timestamp) : (data.date ? new Date(data.date).getTime() : Date.now());
                    activities.push({
                        icon: data.icon || 'fa-info-circle',
                        type: data.type || (data.category || 'Activity'),
                        title: data.title || data.name || data.meetingId || data.message || 'Untitled',
                        timestamp: ts,
                        category: data.category || data.type || 'activity'
                    });
                });

                // sort desc
                activities.sort((a, b) => b.timestamp - a.timestamp);

                // store globally for "View All"
                window.allRecentActivities = activities;

                // render limited set
                renderActivityList(activityShowingAll ? activities : activities.slice(0, activityRenderLimit));
            }).catch(err => console.error('Activity Load Error:', err));
        }, 80);
    }

    const viewAllActivityBtn = document.getElementById('view-all-activity');
    if (viewAllActivityBtn) {
        viewAllActivityBtn.addEventListener('click', () => {
            if (!window.allRecentActivities) return;

        const modalContent = document.createElement('div');
        modalContent.className = 'activity-modal-content';

        const categories = ['announcements', 'resources', 'schedules', 'meetings'];

        categories.forEach(cat => {
            const catActivities = window.allRecentActivities
                .filter(a => a.category === cat)
                .sort((a,b) => b.timestamp - a.timestamp);

            if (catActivities.length) {
                const section = document.createElement('div');
                section.innerHTML = `<h4>${cat.charAt(0).toUpperCase() + cat.slice(1)}</h4>`;
                
                catActivities.forEach(act => {
                    const timeAgo = getTimeAgo(act.timestamp);
                    const item = document.createElement('div');
                    item.className = 'activity-item';
                    item.innerHTML = `
                        <div class="activity-icon"><i class="fas ${act.icon}"></i></div>
                        <div class="activity-content">
                            <p>New ${act.type}: ${act.title}</p>
                            <span class="activity-time">${timeAgo}</span>
                        </div>
                    `;
                    section.appendChild(item);
                });

                modalContent.appendChild(section);
            }
        });

        // Open SweetAlert2 modal
        Swal.fire({
            title: 'All Recent Activity',
            html: modalContent,
            width: '600px',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                popup: 'activity-modal'
            }
        });
        });
    }

    // Helper to render a list of activities
    function renderActivityList(activityArray) {
        const activityListEl = document.getElementById('activity-list');
        activityListEl.innerHTML = '';
        const frag = document.createDocumentFragment();

        activityArray.forEach(act => {
            const timeAgo = getTimeAgo(act.timestamp);
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
                <div class="activity-icon"><i class="fas ${act.icon}"></i></div>
                <div class="activity-content">
                    <p>New ${act.type}: ${act.title}</p>
                    <span class="activity-time">${timeAgo}</span>
                </div>
            `;
            frag.appendChild(item);
        });

        activityListEl.appendChild(frag);

        // show-more inline control
        const activities = window.allRecentActivities || [];
        const existingMore = document.getElementById('activity-show-more');
        if (existingMore) existingMore.remove();
        if (activities.length > activityRenderLimit) {
            const more = document.createElement('div');
            more.id = 'activity-show-more';
            more.className = 'activity-show-more';
            more.textContent = activityShowingAll ? 'Show less' : `Show more (${activities.length - activityRenderLimit})`;
            more.style.cursor = 'pointer';
            more.addEventListener('click', () => {
                activityShowingAll = !activityShowingAll;
                renderActivityList(activityShowingAll ? activities : activities.slice(0, activityRenderLimit));
            });
            activityListEl.appendChild(more);
        }
    }

    // refresh periodically to keep activity fresh but avoid spamming DB
    setInterval(() => loadRecentActivity(), 60 * 1000); // every 60s

    // ========================= UPCOMING EVENTS =========================
    function loadUpcomingEvents() {
        const now = new Date();

        firebase.database().ref("schedules").orderByChild('start').once("value")
        .then(snapshot => {
            let count = 0;
            eventsListEl.innerHTML = ''; // clear existing events

            snapshot.forEach(child => {
                const schedule = child.val();
                if (!schedule.start) return;

                const startDate = new Date(schedule.start);
                if (startDate >= now) {
                    count++;

                    const day = startDate.getDate();
                    const month = startDate.toLocaleString('default', { month: 'short' }).toUpperCase();
                    const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const endTime = schedule.end ? new Date(schedule.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const location = schedule.location || 'TBA';
                    const title = schedule.title || 'Untitled Event';

                    const eventItem = document.createElement('div');
                    eventItem.className = 'event-item';
                    eventItem.innerHTML = `
                        <div class="event-date">
                            <span class="event-day">${day}</span>
                            <span class="event-month">${month}</span>
                        </div>
                        <div class="event-details">
                            <h4>${title}</h4>
                            <p>${startTime}${endTime ? ' - ' + endTime : ''}</p>
                            <span class="event-location">${location}</span>
                        </div>
                        <button class="event-action">RSVP</button>
                    `;
                    eventsListEl.appendChild(eventItem);
                }
            });

            upcomingEventsEl.textContent = count;

            // If no upcoming events
            if (count === 0) {
                eventsListEl.innerHTML = `<p class="no-data">No upcoming events.</p>`;
            }
        }).catch(err => console.error('Error loading upcoming events:', err));
    }

    // ========================= NOTIFICATIONS =========================
    if (notificationBtn) {
        notificationBtn.addEventListener('click', () => {
            if (notificationsDropdown) notificationsDropdown.classList.toggle('active');
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', e => {
        if (!notificationsDropdown) return;
        const clickedInsideDropdown = notificationsDropdown.contains(e.target);
        const clickedOnNotifBtn = notificationBtn && notificationBtn.contains && notificationBtn.contains(e.target);
        if (!clickedInsideDropdown && !clickedOnNotifBtn) {
            notificationsDropdown.classList.remove('active');
        }
    });

    // Tab switching
    notifTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            notifTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabType = tab.dataset.tab;
            loadNotifications(tabType);
        });
    });

    function loadNotifications(filter = 'all') {
        const ref = db.ref('notifications');
        ref.limitToLast(10).once('value').then(snapshot => {
            notificationsListEl.innerHTML = '';
            if (!snapshot.exists()) {
                notificationsListEl.innerHTML = `<p class="no-data">No notifications yet.</p>`;
                return;
            }

            snapshot.forEach(child => {
                const notif = child.val();
                if (filter === 'unread' && notif.read) return;

                const item = document.createElement('div');
                item.className = `notification-item ${notif.read ? '' : 'unread'}`;
                item.innerHTML = `
                    <div class="notif-icon"><i class="fas fa-bell"></i></div>
                    <div class="notif-details">
                        <p>${notif.message || 'New notification'}</p>
                        <span class="notif-time">${getTimeAgo(notif.timestamp)}</span>
                    </div>
                `;
                notificationsListEl.prepend(item);
            });
        });
    }

    // ========================= HELPERS =========================
    function getTimeAgo(timestamp) {
        if (!timestamp) return '';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 },
            { label: 'second', seconds: 1 },
        ];
        for (const i of intervals) {
            const count = Math.floor(seconds / i.seconds);
            if (count >= 1) {
                return `${count} ${i.label}${count > 1 ? 's' : ''} ago`;
            }
        }
        return 'Just now';
    }

    // ========================= INIT =========================
    loadDashboardCounts();
    loadRecentActivity();
    loadUpcomingEvents();
    loadNotifications('all');
});
