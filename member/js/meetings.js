// member/js/meetings.js

document.addEventListener("DOMContentLoaded", () => {
  const auth = firebase.auth();
  const db = firebase.database();

  const meetingsContainer = document.getElementById("meetings-container");

  let currentUser = null;

  // ✅ Check auth
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      Swal.fire("Unauthorized", "You must log in first!", "error");
      setTimeout(() => (window.location.href = "../index.html"), 2000);
      return;
    }

    currentUser = user; // store current user
    loadMeetings();
  });

  // ✅ Load meetings
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

        const isFinished = meeting.finished === true;

        const card = document.createElement("div");
        card.classList.add("meeting-card");
        if (isFinished) card.classList.add("past-meeting");

        // Check member attendance for finished meetings
        let attendanceStatus = "";
        if (isFinished && meeting.attendance?.attendees?.[currentUser.uid]) {
          attendanceStatus = meeting.attendance.attendees[currentUser.uid];
        }

        if (isFinished) {
        const statusClass = attendanceStatus ? attendanceStatus.toLowerCase() : "not-recorded";
        card.innerHTML = `
            <h3>Meeting ID: ${meeting.meetingId}</h3>
            <p><b>Date:</b> ${meeting.date}</p>
            <p><b>Time:</b> ${meeting.time}</p>
            <p><b>Attendance:</b> <span class="attendance ${statusClass}">${attendanceStatus || "Not recorded"}</span></p>
            <button class="meeting-ended-btn" disabled>Meeting Ended</button>
        `;
        } else {
          card.innerHTML = `
            <h3>Meeting ID: ${meeting.meetingId}</h3>
            <p><b>Date:</b> ${meeting.date}</p>
            <p><b>Time:</b> ${meeting.time}</p>
            <button class="join-meeting-btn">Join Meeting</button>
          `;

          // Join button click
          card.querySelector(".join-meeting-btn").addEventListener("click", () => {
            Swal.fire({
              icon: "info",
              title: "Meeting Details",
              html: `
                <p><b>Meeting ID:</b> ${meeting.meetingId}</p>
                <p><b>Passcode:</b> ${meeting.passcode}</p>
                <p><b>Date & Time:</b> ${meeting.date} @ ${meeting.time}</p>
                <a href="https://zoom.us/j/${meeting.meetingId}?pwd=${meeting.passcode}" target="_blank" class="swal2-confirm swal2-styled">Join Zoom</a>
              `,
              showCloseButton: true,
              showConfirmButton: false,
            });
          });
        }

        meetingsContainer.appendChild(card);
      });
    });
  }
});
