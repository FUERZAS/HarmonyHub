// schedules.js
// Requires: firebase-config.js, SweetAlert2, FullCalendar

document.addEventListener("DOMContentLoaded", () => {
  const auth = firebase.auth();
  const db = firebase.database();

  const addBtn = document.getElementById("add-schedule-btn");
  const modal = document.getElementById("add-schedule-modal");
  const closeModal = document.getElementById("close-modal");
  const scheduleForm = document.getElementById("schedule-form");

  const calendarEl = document.getElementById("calendar");
  let calendar;

  // Initialize FullCalendar
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay"
    },
    selectable: true,
    editable: false,
    events: [],
    dateClick: (info) => {
      Swal.fire("Selected Date", info.dateStr, "info");
    },
    eventClick: (info) => {
      Swal.fire({
        title: info.event.title,
        html: `
          <p><strong>Type:</strong> ${info.event.extendedProps.type || "N/A"}</p>
          <p><strong>Start:</strong> ${info.event.start.toLocaleString()}</p>
          <p><strong>End:</strong> ${info.event.end ? info.event.end.toLocaleString() : "N/A"}</p>
        `,
        icon: "info"
      });
    }
  });
  calendar.render();

  // ---- Load schedules from Firebase ----
  function loadSchedules() {
    const schedulesRef = db.ref('schedules');

    // Initial load: populate calendar once with last N events to reduce initial payload
    schedulesRef.orderByChild('start').limitToLast(500).once('value').then(snapshot => {
      const data = snapshot.val() || {};
      const events = Object.keys(data).map(id => ({
        id,
        title: data[id].title,
        start: data[id].start,
        end: data[id].end || null,
        type: data[id].type,
        allDay: false
      }));

      calendar.removeAllEvents();
      calendar.addEventSource(events);
    }).catch(err => console.error('Initial schedules load failed:', err));

    // Incremental updates keep calendar responsive without full reloads
    schedulesRef.on('child_added', (snap) => {
      const id = snap.key;
      const s = snap.val();
      if (!s) return;
      calendar.addEvent({ id, title: s.title, start: s.start, end: s.end || null, extendedProps: { type: s.type }, allDay: false });
    });

    schedulesRef.on('child_changed', (snap) => {
      const id = snap.key;
      const s = snap.val();
      const ev = calendar.getEventById(id);
      if (ev) {
        ev.setProp('title', s.title || ev.title);
        ev.setStart(s.start);
        if (s.end) ev.setEnd(s.end); else ev.setEnd(null);
        ev.setExtendedProp('type', s.type);
      } else {
        // event may not be present yet, add it
        calendar.addEvent({ id, title: s.title, start: s.start, end: s.end || null, extendedProps: { type: s.type }, allDay: false });
      }
    });

    schedulesRef.on('child_removed', (snap) => {
      const id = snap.key;
      const ev = calendar.getEventById(id);
      if (ev) ev.remove();
      // Also remove mirrored activity_table entry if present
      db.ref('activity_table').child(id).remove().catch(() => {});
    });
  }
  loadSchedules();

  // ---- Modal handling ----
  addBtn.addEventListener("click", () => {
    modal.style.display = "block";
  });

  closeModal.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // ---- Add schedule ----
  scheduleForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = document.getElementById("schedule-title").value.trim();
    const startDate = document.getElementById("schedule-start-date").value;
    const startTime = document.getElementById("schedule-start-time").value;
    const endDate = document.getElementById("schedule-end-date").value;
    const endTime = document.getElementById("schedule-end-time").value;
    const type = document.getElementById("schedule-type").value;

    if (!title || !startDate || !startTime) {
      Swal.fire('Error', 'Please fill in the title, start date, and start time.', 'error');
      return;
    }

    // build ISO timestamps and validate
    const startISO = `${startDate}T${startTime}`;
    const endISO = (endDate && endTime) ? `${endDate}T${endTime}` : null;
    const startTs = Date.parse(startISO);
    const endTs = endISO ? Date.parse(endISO) : null;
    if (isNaN(startTs) || (endISO && isNaN(endTs))) {
      Swal.fire('Error', 'Invalid date/time format.', 'error');
      return;
    }
    if (endTs && endTs <= startTs) {
      Swal.fire('Error', 'End must be after start.', 'error');
      return;
    }

    // Use a single key for schedules and activity to make synchronization easier
    const newScheduleRef = db.ref('schedules').push();
    const scheduleId = newScheduleRef.key;

    const scheduleData = { title, start: startISO, end: endISO, type, timestamp: Date.now() };

    // Write schedule then mirror to activity_table under same id (best-effort atomicity)
    const updates = {};
    updates[`/schedules/${scheduleId}`] = scheduleData;
    updates[`/activity_table/${scheduleId}`] = {
      type: 'schedule',
      start: startISO,
      end: endISO,
      title,
      scheduleType: type,
      timestamp: Date.now()
    };

    db.ref().update(updates).then(() => {
      Swal.fire('Success', 'Schedule added successfully!', 'success');
      scheduleForm.reset();
      modal.style.display = 'none';
    }).catch(err => {
      console.error('Failed to add schedule:', err);
      Swal.fire('Error', 'Failed to save schedule. Try again.', 'error');
    });
  });

  // ---- Auth Check ----
  auth.onAuthStateChanged((user) => {
    if (!user) {
      Swal.fire("Unauthorized", "Please log in first.", "error").then(() => {
        window.location.href = "../index.html";
      });
    }
  });
});
