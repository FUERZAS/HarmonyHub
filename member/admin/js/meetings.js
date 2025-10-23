// meetings.js
// Updated: Beautified meeting card buttons + delete button

document.addEventListener("DOMContentLoaded", () => {
  const auth = firebase.auth();
  const db = firebase.database();

  const meetingsContainer = document.getElementById("meetings-container");
  const addMeetingBtn = document.getElementById("add-meeting-btn");
  const addMeetingModal = document.getElementById("add-meeting-modal");
  const closeMeetingModal = document.getElementById("close-meeting-modal");
  const meetingForm = document.getElementById("meeting-form");

  const attendanceModal = document.getElementById("attendance-modal");
  const attendanceUsersContainer = document.getElementById("attendance-users");
  const attendanceForm = document.getElementById("attendance-form");
  const closeAttendanceModal = document.getElementById("close-attendance-modal");

  const viewAttendanceModal = document.getElementById("view-attendance-modal");
  const viewAttendanceContainer = document.getElementById("view-attendance-users");
  const closeViewAttendanceModal = document.getElementById("close-view-attendance-modal");

  let currentUser = null;
  let selectedMeetingId = null;
  let attendanceRecords = {};

  // ---------- AUTH ----------
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      Swal.fire("Unauthorized", "You must log in first!", "error");
      setTimeout(() => (window.location.href = "../index.html"), 2000);
      return;
    }

    const snapshot = await db.ref("users/" + user.uid).once("value");
    const userData = snapshot.val();

    if (!userData || userData.role !== "admin") {
      Swal.fire("Access Denied", "Admins only!", "error");
      setTimeout(() => (window.location.href = "../index.html"), 2000);
      return;
    }

    currentUser = userData;
    loadMeetings();
  });

  // ---------- LOAD MEETINGS ----------
  function loadMeetings() {
    db.ref("meetings").on("value", (snapshot) => {
      meetingsContainer.innerHTML = "";

      if (!snapshot.exists()) {
        meetingsContainer.innerHTML = `
          <p class="no-meetings-msg">📭 No meetings scheduled yet.</p>
        `;
        return;
      }

      snapshot.forEach((child) => {
        const meeting = child.val();
        const key = child.key;

        const card = document.createElement("div");
        card.classList.add("meeting-card");
        card.style.cssText = `
          border: 1px solid #444;
          border-radius: 12px;
          background: #FFFFFF;
          padding: 16px;
          margin: 10px 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;

        let actions = "";

        if (meeting.finished) {
          actions = `
            <div class="button-group">
              <button class="btn-secondary view-attendance-btn" data-id="${key}">👁 View Attendance</button>
              <button class="btn-danger delete-meeting-btn" data-id="${key}">🗑 Delete</button>
            </div>
          `;
        } else {
          actions = `
            <div class="button-group">
              <a href="https://zoom.us/j/${meeting.meetingId}?pwd=${meeting.passcode}" target="_blank" class="btn-primary">💻 Join</a>
              <button class="btn-secondary take-attendance-btn" data-id="${key}">📝 Take Attendance</button>
              <button class="btn-success finish-meeting-btn" data-id="${key}">✅ Finish</button>
              <button class="btn-danger delete-meeting-btn" data-id="${key}">🗑 Delete</button>
            </div>
          `;
        }

        card.innerHTML = `
          <h3>Meeting ID: <span>${meeting.meetingId}</span></h3>
          <p><b>Passcode:</b> ${meeting.passcode}</p>
          <p><b>Date:</b> ${meeting.date}</p>
          <p><b>Time:</b> ${meeting.time}</p>
          ${actions}
        `;

        meetingsContainer.appendChild(card);
      });

      // Add button styling
      const style = document.createElement("style");
      style.textContent = `
        .button-group {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }
        .btn-primary, .btn-secondary, .btn-success, .btn-danger {
          border: none;
          border-radius: 6px;
          padding: 8px 14px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-primary { background: #007bff; }
        .btn-primary:hover { background: #0069d9; }
        .btn-secondary { background: #6c757d; }
        .btn-secondary:hover { background: #5a6268; }
        .btn-success { background: #28a745; }
        .btn-success:hover { background: #218838; }
        .btn-danger { background: #dc3545; }
        .btn-danger:hover { background: #c82333; }
      `;
      document.head.appendChild(style);

      // Attach event listeners
      document.querySelectorAll(".take-attendance-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          selectedMeetingId = e.target.dataset.id;
          openAttendanceModal(selectedMeetingId);
        });
      });

      document.querySelectorAll(".finish-meeting-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          finishMeeting(e.target.dataset.id);
        });
      });

      document.querySelectorAll(".view-attendance-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          openViewAttendanceModal(e.target.dataset.id);
        });
      });

      document.querySelectorAll(".delete-meeting-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          deleteMeeting(e.target.dataset.id);
        });
      });
    });
  }

  // ---------- ADD MEETING ----------
  addMeetingBtn.addEventListener("click", () => {
    addMeetingModal.style.display = "block";
  });

  closeMeetingModal.addEventListener("click", () => {
    addMeetingModal.style.display = "none";
  });

  meetingForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const now = Date.now();

    const meetingData = {
      meetingId: document.getElementById("meeting-id").value,
      passcode: document.getElementById("meeting-passcode").value,
      date: document.getElementById("meeting-date").value,
      time: document.getElementById("meeting-time").value,
      finished: false,
      timestamp: now,
    };

    const newMeetingRef = db.ref("meetings").push();

    newMeetingRef
      .set(meetingData)
      .then(() => {
        const activityData = {
          type: "meeting_created",
          meetingId: meetingData.meetingId,
          passcode: meetingData.passcode,
          date: meetingData.date,
          time: meetingData.time,
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString(),
          timestamp: now,
          readBy: {}
        };
        return db.ref("activity_table").child(newMeetingRef.key).set(activityData);
      })
      .then(() => {
        Swal.fire("Success", "Meeting scheduled successfully!", "success");
        meetingForm.reset();
        addMeetingModal.style.display = "none";
      })
      .catch((error) => {
        Swal.fire("Error", error.message, "error");
      });
  });

  // ---------- DELETE MEETING ----------
  function deleteMeeting(meetingKey) {
    Swal.fire({
      title: "Delete this meeting?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it"
    }).then((result) => {
      if (result.isConfirmed) {
        db.ref(`meetings/${meetingKey}`).remove()
          .then(() => db.ref(`activity_table/${meetingKey}`).remove())
          .then(() => {
            Swal.fire("Deleted!", "Meeting and related activity have been removed.", "success");
          })
          .catch((error) => Swal.fire("Error", error.message, "error"));
      }
    });
  }

  // ---------- ATTENDANCE ----------
  function openAttendanceModal(meetingKey) {
    attendanceUsersContainer.innerHTML = "";
    attendanceRecords = {};

    db.ref("users").once("value", (snapshot) => {
      snapshot.forEach((child) => {
        const user = child.val();
        if (user.role !== "admin") {
          attendanceRecords[child.key] = "absent";

          const div = document.createElement("div");
          div.classList.add("attendance-user");
          div.innerHTML = `
            <p><b>${user.name || "Unnamed User"}</b></p>
            <div class="status-buttons">
              <button type="button" class="status-btn present" data-user="${child.key}" data-status="present">Present</button>
              <button type="button" class="status-btn absent active" data-user="${child.key}" data-status="absent">Absent</button>
              <button type="button" class="status-btn late" data-user="${child.key}" data-status="late">Late</button>
              <button type="button" class="status-btn excused" data-user="${child.key}" data-status="excused">Excused</button>
            </div>
          `;
          attendanceUsersContainer.appendChild(div);
        }
      });

      document.querySelectorAll(".status-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const userId = e.target.dataset.user;
          const status = e.target.dataset.status;
          attendanceRecords[userId] = status;
          const siblings = e.target.parentNode.querySelectorAll(".status-btn");
          siblings.forEach((b) => b.classList.remove("active"));
          e.target.classList.add("active");
        });
      });
    });

    attendanceModal.style.display = "block";
  }

  closeAttendanceModal.addEventListener("click", () => {
    attendanceModal.style.display = "none";
  });

  attendanceForm.addEventListener("submit", (e) => {
    e.preventDefault();
    db.ref(`meetings/${selectedMeetingId}/attendance`).set({
      date: new Date().toISOString(),
      attendees: attendanceRecords,
    }).then(() => {
      Swal.fire("Saved", "Attendance recorded successfully!", "success");
      attendanceModal.style.display = "none";
    });
  });

  // ---------- FINISH MEETING ----------
  function finishMeeting(meetingKey) {
    db.ref(`meetings/${meetingKey}`).update({ finished: true }).then(() => {
      Swal.fire("Meeting Finished", "You can now view attendance records.", "success");
    });
  }

  // ---------- VIEW ATTENDANCE ----------
  function openViewAttendanceModal(meetingKey) {
    viewAttendanceContainer.innerHTML = "";

    db.ref(`meetings/${meetingKey}/attendance/attendees`).once("value", (snapshot) => {
      if (!snapshot.exists()) {
        viewAttendanceContainer.innerHTML = "<p>No attendance records found.</p>";
        return;
      }

      snapshot.forEach((child) => {
        const status = child.val();
        const userId = child.key;

        db.ref("users/" + userId).once("value", (uSnap) => {
          const user = uSnap.val();
          const div = document.createElement("div");
          div.classList.add("attendance-user");
          div.innerHTML = `
            <span class="user-name">${user?.name || "Unnamed User"}</span>
            <span class="status ${status}">${status}</span>
          `;
          viewAttendanceContainer.appendChild(div);
        });
      });
    });

    viewAttendanceModal.style.display = "block";
  }

  closeViewAttendanceModal.addEventListener("click", () => {
    viewAttendanceModal.style.display = "none";
  });
});
