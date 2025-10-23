// dashboard.js (Staff/Admin)
document.addEventListener('DOMContentLoaded', function () {
    const upcomingEventsEl = document.getElementById('upcoming-events');
    const resourcesCountEl = document.getElementById('resources-count');
    const meetingsCountEl = document.getElementById('meetings-count');
    const announcementsCountEl = document.getElementById('announcements-count');
    const eventsListEl = document.getElementById('events-list');

    // ===================== LOAD UPCOMING EVENTS =====================
    // ===================== LOAD UPCOMING EVENTS =====================
    function loadUpcomingEvents() {
        const now = new Date();
        const schedulesRef = firebase.database().ref('schedules');

        schedulesRef.orderByChild('start').once('value')
        .then(snapshot => {
            let count = 0;
            eventsListEl.innerHTML = ''; // Clear existing events

            snapshot.forEach(child => {
                const schedule = child.val();
                if (!schedule.start) return;

                const startDate = new Date(schedule.start);
                if (startDate >= now) {
                    count++;

                    const day = startDate.getDate();
                    const month = startDate.toLocaleString('default', { month: 'short' }).toUpperCase();
                    const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    let endTime = '';
                    if (schedule.end) {
                        endTime = new Date(schedule.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }

                    const location = schedule.location || 'TBA';
                    const title = schedule.title || 'Untitled Event';

                    const eventItem = document.createElement('div');
                    eventItem.classList.add('event-item');
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

            // Handle case with no upcoming events
            if (count === 0) {
                eventsListEl.innerHTML = `<p class="no-data">No upcoming events.</p>`;
            }
        })
        .catch(err => console.error('Error loading upcoming events:', err));
    }

    // ===================== LOAD RESOURCES COUNT =====================
    function loadResourcesCount() {
        firebase.database().ref('resources').once('value', snapshot => {
            resourcesCountEl.textContent = snapshot.numChildren();
        });
    }

    // ===================== LOAD MEETINGS COUNT =====================
    function loadMeetingsCount() {
        firebase.database().ref('meetings').once('value', snapshot => {
            meetingsCountEl.textContent = snapshot.numChildren();
        });
    }

    // ===================== LOAD ANNOUNCEMENTS COUNT =====================
    function loadAnnouncementsCount() {
        firebase.database().ref('announcements').once('value', snapshot => {
            announcementsCountEl.textContent = snapshot.numChildren();
        });
    }

    // ===================== INITIALIZE DASHBOARD =====================
    function initDashboard() {
        loadUpcomingEvents();
        loadResourcesCount();
        loadMeetingsCount();
        loadAnnouncementsCount();
    }

    initDashboard();

    // Optional: Auto-refresh every 60 seconds
    setInterval(() => {
        initDashboard();
    }, 60000);
});
