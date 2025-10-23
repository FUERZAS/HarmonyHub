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
    const schedulesRef = db.ref("schedules");

    schedulesRef.on("value", (snapshot) => {
      const data = snapshot.val();
      const events = [];

      for (const id in data) {
        const sched = data[id];
        events.push({
          id,
          title: sched.title,
          start: sched.start,
          end: sched.end || null,
          type: sched.type,
          allDay: false
        });
      }

      calendar.removeAllEvents();
      calendar.addEventSource(events);
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
      Swal.fire("Error", "Please fill in the title, start date, and start time.", "error");
      return;
    }

    // Combine date + time into ISO-like format
    const start = `${startDate}T${startTime}`;
    const end = endDate && endTime ? `${endDate}T${endTime}` : null;

    // Save to /schedules
    const newScheduleRef = db.ref("schedules").push();
    const scheduleId = newScheduleRef.key;

    const scheduleData = { title, start, end, type };

    newScheduleRef
      .set(scheduleData)
      .then(() => {
        // Save to /activity_table with same ID
        const activityData = {
        type: "schedule",       // fixed type for activity_table
        start,
        end,
        title,
        scheduleType: type,     // copy from schedule.type
        timestamp: Date.now()   // 🔥 new unified timestamp for sorting
      };

      return db.ref("activity_table").child(scheduleId).set(activityData);
      })
      .then(() => {
        Swal.fire("Success", "Schedule added successfully!", "success");
        scheduleForm.reset();
        modal.style.display = "none";
      })
      .catch((err) => {
        Swal.fire("Error", err.message, "error");
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
