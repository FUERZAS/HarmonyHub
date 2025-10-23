// ========================= STAFF MEETINGS =========================
// Requires: firebase-config.js, SweetAlert2
// Permission required: /canInitializeMeetings = true

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
  let canInitializeMeetings = false;

  // ✅ Auth & Role Check
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      Swal.fire("Unauthorized", "You must log in first!", "error");
      setTimeout(() => (window.location.href = "../index.html"), 2000);
      return;
    }

    const snapshot = await db.ref("users/" + user.uid).once("value");
    const userData = snapshot.val();

    if (!userData || (userData.role !== "staff" && userData.role !== "admin")) {
      Swal.fire("Access Denied", "Only staff and admins can access this page.", "error");
      setTimeout(() => (window.location.href = "../index.html"), 2000);
      return;
    }

    currentUser = userData;
    canInitializeMeetings = !!userData.permissions?.canInitializeMeetings;

    if (!canInitializeMeetings && addMeetingBtn) {
      addMeetingBtn.style.display = "none";
    } else if (canInitializeMeetings && addMeetingBtn) {
      addMeetingBtn.addEventListener("click", () => {
        addMeetingModal.style.display = "block";
      });
    }

    if (meetingForm) {
      meetingForm.addEventListener("submit", (e) => {
        e.preventDefault();

        if (!canInitializeMeetings) {
          Swal.fire("Access Denied", "You are not authorized to create meetings.", "error");
          return;
        }

        const meetingData = {
          meetingId: document.getElementById("meeting-id").value,
          passcode: document.getElementById("meeting-passcode").value,
          date: document.getElementById("meeting-date").value,
          time: document.getElementById("meeting-time").value,
          finished: false,
          createdBy: currentUser.name || "Staff Member",
          createdAt: new Date().toISOString(), // keep for legacy
        };

        // Save meeting
        const newMeetingRef = db.ref("meetings").push();
        const meetingKey = newMeetingRef.key;

        newMeetingRef
          .set(meetingData)
          .then(() => {
            // ✅ Only log to activity_table if staff has permission
            if (canInitializeMeetings) {
              const activityData = {
                type: "meeting",
                meetingId: meetingData.meetingId,
                passcode: meetingData.passcode,
                date: meetingData.date,
                time: meetingData.time,
                createdBy: meetingData.createdBy,
                createdAt: meetingData.createdAt, // legacy
                timestamp: Date.now(), // ✅ unified timestamp for sorting
              };
              return db.ref("activity_table").child(meetingKey).set(activityData);
            }
          })
          .then(() => {
            Swal.fire("Success", "Meeting scheduled successfully!", "success");
            meetingForm.reset();
            addMeetingModal.style.display = "none";
          })
          .catch((error) => {
            console.error("Error creating meeting:", error);
            Swal.fire("Error", "Failed to schedule meeting.", "error");
          });
      });
    }

    if (closeMeetingModal) {
      closeMeetingModal.addEventListener("click", () => {
        addMeetingModal.style.display = "none";
      });
    }

    loadMeetings();
  });

  // ✅ Load Meetings
  function loadMeetings() {
    db.ref("meetings").on("value", (snapshot) => {
      meetingsContainer.innerHTML = "";

      if (!snapshot.exists()) {
        meetingsContainer.innerHTML = `<p class="no-meetings-msg">📭 No meetings scheduled yet.</p>`;
        return;
      }

      snapshot.forEach((child) => {
        const meeting = child.val();
        const key = child.key;

        const card = document.createElement("div");
        card.classList.add("meeting-card");

        let actions = "";

        if (meeting.finished) {
          actions = `<button class="btn-secondary view-attendance-btn" data-id="${key}">View Attendance</button>`;
        } else {
          if (canInitializeMeetings) {
            actions = `
              <a href="https://zoom.us/j/${meeting.meetingId}?pwd=${meeting.passcode}" target="_blank" class="btn-primary">Join Meeting</a>
              <button class="btn-secondary take-attendance-btn" data-id="${key}">Take Attendance</button>
              <button class="btn-danger finish-meeting-btn" data-id="${key}">Finish Meeting</button>
            `;
          } else {
            actions = `<a href="https://zoom.us/j/${meeting.meetingId}?pwd=${meeting.passcode}" target="_blank" class="btn-primary">Join Meeting</a>`;
          }
        }

        card.innerHTML = `
          <h3>Meeting ID: ${meeting.meetingId}</h3>
          <p><b>Passcode:</b> ${meeting.passcode}</p>
          <p><b>Date:</b> ${meeting.date}</p>
          <p><b>Time:</b> ${meeting.time}</p>
          <div class="card-actions">${actions}</div>
        `;

        meetingsContainer.appendChild(card);
      });

      if (canInitializeMeetings) {
        document.querySelectorAll(".take-attendance-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            selectedMeetingId = e.target.dataset.id;
            openAttendanceModal(selectedMeetingId);
          });
        });

        document.querySelectorAll(".finish-meeting-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const meetingKey = e.target.dataset.id;
            finishMeeting(meetingKey);
          });
        });
      }

      document.querySelectorAll(".view-attendance-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const meetingKey = e.target.dataset.id;
          openViewAttendanceModal(meetingKey);
        });
      });
    });
  }

  function openAttendanceModal(meetingKey) {
    if (!canInitializeMeetings) {
      Swal.fire("Access Denied", "You cannot take attendance.", "error");
      return;
    }

    attendanceUsersContainer.innerHTML = "";
    attendanceRecords = {};

    db.ref("users").once("value", (snapshot) => {
      snapshot.forEach((child) => {
        const user = child.val();
        if (user.role === "member") {
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

  if (closeAttendanceModal) {
    closeAttendanceModal.addEventListener("click", () => {
      attendanceModal.style.display = "none";
    });
  }

  if (attendanceForm) {
    attendanceForm.addEventListener("submit", (e) => {
      e.preventDefault();

      if (!canInitializeMeetings) {
        Swal.fire("Access Denied", "You cannot record attendance.", "error");
        return;
      }

      db.ref(`meetings/${selectedMeetingId}/attendance`)
        .set({
          date: new Date().toISOString(),
          attendees: attendanceRecords,
        })
        .then(() => {
          Swal.fire("Saved", "Attendance recorded successfully!", "success");
          attendanceModal.style.display = "none";
        });
    });
  }

  function finishMeeting(meetingKey) {
    if (!canInitializeMeetings) {
      Swal.fire("Access Denied", "You cannot finish this meeting.", "error");
      return;
    }

    db.ref(`meetings/${meetingKey}`).update({ finished: true }).then(() => {
      Swal.fire("Meeting Finished", "You can now view attendance records.", "success");
    });
  }

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

  if (closeViewAttendanceModal) {
    closeViewAttendanceModal.addEventListener("click", () => {
      viewAttendanceModal.style.display = "none";
    });
  }
});
