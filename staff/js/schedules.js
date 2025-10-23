// ================================
// Staff Schedules Page Script
// Requires: Firebase Auth + Database + SweetAlert2 + FullCalendar
// Permission required: /canAppointSchedules = true (for creating schedules)
// ================================
document.addEventListener("DOMContentLoaded", () => {
  const auth = firebase.auth();
  const db = firebase.database();

  // ---------- ELEMENTS ----------
  const addBtn = document.getElementById("add-schedule-btn");
  const modal = document.getElementById("add-schedule-modal");
  const closeModal = document.getElementById("close-modal");
  const scheduleForm = document.getElementById("schedule-form");
  const calendarEl = document.getElementById("calendar");

  let calendar;
  let canAppoint = false;

  // ---------- AUTH & PERMISSION CHECK ----------
  auth.onAuthStateChanged((user) => {
    if (!user) {
      Swal.fire("Unauthorized", "Please log in first.", "error").then(() => {
        window.location.href = "../index.html";
      });
      return;
    }

    db.ref(`users/${user.uid}`).once("value")
      .then((snap) => {
        const userData = snap.val() || {};
        const role = userData.role || "member";
        canAppoint = userData.permissions?.canAppointSchedules === true;

        // Allow only staff
        if (role !== "staff") {
          Swal.fire("Unauthorized", "You are not authorized to access this page!", "error")
            .then(() => (window.location.href = "../index.html"));
          return;
        }

        // Hide Add button if no permission
        if (!canAppoint && addBtn) addBtn.style.display = "none";

        // Initialize calendar after permission check
        initializeCalendar();
        loadSchedules();
      })
      .catch((err) => {
        console.error(err);
        Swal.fire("Error", "Failed to verify your access.", "error")
          .then(() => (window.location.href = "../index.html"));
      });
  });

  // ---------- FULLCALENDAR INITIALIZATION ----------
  function initializeCalendar() {
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
  }

  // ---------- LOAD SCHEDULES ----------
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

  // ---------- MODAL HANDLING ----------
  addBtn?.addEventListener("click", () => {
    if (!canAppoint) {
      Swal.fire("Access Denied", "You don't have permission to add schedules.", "error");
      return;
    }
    modal.style.display = "block";
  });

  closeModal?.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // ---------- ADD NEW SCHEDULE ----------
  scheduleForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!canAppoint) {
      Swal.fire("Unauthorized", "You don't have permission to create schedules.", "error");
      return;
    }

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

    const start = `${startDate}T${startTime}`;
    const end = endDate && endTime ? `${endDate}T${endTime}` : null;

    const newScheduleRef = db.ref("schedules").push();
    const scheduleId = newScheduleRef.key;
    const scheduleData = {
      title,
      start,
      end,
      type,
      createdBy: auth.currentUser?.uid || "unknown",
      timestamp: Date.now() // ✅ Unified timestamp field
    };

    // Save schedule
    newScheduleRef.set(scheduleData)
      .then(() => {
        // 🔹 Only add to activity_table if staff has permission (intentional notification)
        if (canAppoint) {
          const activityData = {
            type: "schedule",
            title,
            start,
            end,
            scheduleType: type,
            createdBy: scheduleData.createdBy,
            timestamp: scheduleData.timestamp // ✅ use timestamp for notification sorting
          };
          return db.ref("activity_table").child(scheduleId).set(activityData);
        }
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
});
