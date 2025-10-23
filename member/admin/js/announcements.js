// announcements.js
// Requires firebase-config.js (provides `database`) and SweetAlert2

document.addEventListener("DOMContentLoaded", () => {
  const announcementsRef = database.ref("announcements");
  const activityRef = database.ref("activity_table");

  // UI Elements
  const announcementsList = document.getElementById("announcements-list");
  const loadingIndicator = document.getElementById("loading-indicator");
  const noAnnouncementsMsg = document.getElementById("no-announcements-message");

  const totalAnnouncements = document.getElementById("total-announcements");
  const publishedAnnouncements = document.getElementById("published-announcements");
  const draftAnnouncements = document.getElementById("draft-announcements");

  const searchInput = document.getElementById("announcement-search");
  const statusFilter = document.getElementById("status-filter");
  const audienceFilter = document.getElementById("audience-filter");

  const createBtn = document.getElementById("create-announcement-btn");

  const announcementModal = document.getElementById("announcement-modal");
  const previewModal = document.getElementById("preview-modal");
  const modalTitle = document.getElementById("modal-title");
  const form = document.getElementById("announcement-form");
  const previewContent = document.getElementById("preview-content");

  let currentEditId = null;
  let announcementsCache = {};

  // ---------------- AUTH CHECK (Admins Only) ----------------
  auth.onAuthStateChanged((user) => {
    if (!user) {
      Swal.fire("Unauthorized", "Please log in first.", "error").then(() => {
        window.location.href = "../index.html";
      });
      return;
    }

    // ✅ Fetch user role from RTDB
    database.ref(`users/${user.uid}/role`).once("value")
      .then((snapshot) => {
        const role = snapshot.val();

        if (role !== "admin") {
          Swal.fire("Unauthorized", "You are not authorized to access this page!", "error")
            .then(() => {
              window.location.href = "../index.html";
            });
        } else {
          // ✅ Allow admin access
          loadAnnouncements();
        }
      })
      .catch((err) => {
        console.error("Error fetching user role:", err);
        Swal.fire("Error", "Could not verify your permissions.", "error").then(() => {
          window.location.href = "../index.html";
        });
      });
  });

  // ---------------- Load announcements (live) ----------------
  function loadAnnouncements() {
    loadingIndicator.style.display = "flex";
    announcementsRef.on("value", (snapshot) => {
      announcementsCache = snapshot.val() || {};
      renderAnnouncements();
      loadingIndicator.style.display = "none";
    }, (err) => {
      console.error("Firebase read error:", err);
      Swal.fire("Error", "Could not load announcements.", "error");
      loadingIndicator.style.display = "none";
    });
  }

  // ---------------- Render ----------------
  function renderAnnouncements() {
    announcementsList.innerHTML = "";
    const query = (searchInput.value || "").toLowerCase();
    const status = statusFilter.value;
    const audience = audienceFilter.value;

    let total = 0, published = 0, draft = 0;
    let matched = 0;

    Object.entries(announcementsCache).forEach(([id, ann]) => {
      total++;
      if (ann.status === "published") published++;
      if (ann.status === "draft") draft++;

      // filters
      if (status !== "all" && ann.status !== status) return;
      if (audience !== "all" && ann.audience !== audience) return;
      if (query && !((ann.title || "").toLowerCase().includes(query) || (ann.content || "").toLowerCase().includes(query))) return;

      matched++;

      const card = document.createElement("div");
      card.className = "announcement-card";
      card.innerHTML = `
        <div class="card-header">
          <h3 class="card-title">${escapeHtml(ann.title || "Untitled")}</h3>
          <span class="card-status ${ann.status || ""}">${capitalize(ann.status || "unknown")}</span>
        </div>
        <div class="card-body">
          <p class="card-audience"><strong>Audience:</strong> ${formatAudience(ann.audience)}</p>
          <p class="card-date"><strong>Date:</strong> ${formatDate(ann.date)}</p>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-secondary preview-btn">Preview</button>
          <button class="btn btn-sm btn-primary edit-btn">Edit</button>
          <button class="btn btn-sm btn-danger delete-btn">Delete</button>
        </div>
      `;

      card.querySelector(".preview-btn").addEventListener("click", () => previewAnnouncement(id, ann));
      card.querySelector(".edit-btn").addEventListener("click", () => openEditModal(id, ann));
      card.querySelector(".delete-btn").addEventListener("click", () => deleteAnnouncement(id));

      announcementsList.appendChild(card);
    });

    // Update stats
    totalAnnouncements.textContent = total;
    publishedAnnouncements.textContent = published;
    draftAnnouncements.textContent = draft;

    noAnnouncementsMsg.style.display = matched === 0 ? "block" : "none";
  }

  // ---------------- Create / Edit ----------------
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = document.getElementById("announcement-title").value.trim();
    const content = document.getElementById("announcement-content").value.trim();
    const audience = document.getElementById("announcement-audience").value;
    const status = document.getElementById("announcement-status").value;

    if (!title || !content) {
      Swal.fire("Error", "Please fill in required fields.", "error");
      return;
    }

    const now = Date.now();
    const isoDate = new Date(now).toISOString();

    const announcementData = {
      title,
      content,
      audience,
      status,
      date: isoDate, // keep existing
      timestamp: now // ✅ added for unified sorting
    };

    if (currentEditId) {
      // ✅ Update existing announcement
      const activityData = {
        type: "announcement",
        refId: currentEditId,
        ...announcementData,
        updatedAt: isoDate, // readable
        timestamp: now // ensure update reflects in unified feed
      };

      Promise.all([
        announcementsRef.child(currentEditId).update(announcementData),
        activityRef.child(currentEditId).update(activityData)
      ])
        .then(() => Swal.fire("Updated", "Announcement updated successfully.", "success"))
        .catch(err => {
          console.error(err);
          Swal.fire("Error", "Failed to update announcement.", "error");
        });
    } else {
      // ✅ Create new announcement
      const newRef = announcementsRef.push();
      const newId = newRef.key;

      const activityData = {
        type: "announcement",
        refId: newId,
        ...announcementData,
        createdAt: isoDate,
        timestamp: now
      };

      Promise.all([
        newRef.set(announcementData),
        activityRef.child(newId).set(activityData)
      ])
        .then(() => Swal.fire("Created", "Announcement created successfully.", "success"))
        .catch(err => {
          console.error(err);
          Swal.fire("Error", "Failed to create announcement.", "error");
        });
    }

    closeModal(announcementModal);
  });

  // ---------------- Delete ----------------
  function deleteAnnouncement(id) {
    Swal.fire({
      title: "Are you sure?",
      text: "This will permanently delete the announcement.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!"
    }).then((result) => {
      if (result.isConfirmed) {
        Promise.all([
          announcementsRef.child(id).remove(),
          activityRef.child(id).remove()
        ])
          .then(() => Swal.fire("Deleted", "Announcement deleted.", "success"))
          .catch((err) => {
            console.error(err);
            Swal.fire("Error", "Failed to delete announcement.", "error");
          });
      }
    });
  }

  // ---------------- Preview ----------------
  function previewAnnouncement(id, ann) {
    previewContent.innerHTML = `
      <h3>${escapeHtml(ann.title || "")}</h3>
      <p><strong>Status:</strong> ${capitalize(ann.status || "")}</p>
      <p><strong>Audience:</strong> ${formatAudience(ann.audience)}</p>
      <p><strong>Date:</strong> ${formatDate(ann.date)}</p>
      <div class="preview-text">${escapeHtml(ann.content || "").replace(/\n/g, "<br>")}</div>
    `;
    openModal(previewModal);
  }

  // ---------------- Modal helpers ----------------
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = "flex";
  }

  function closeModal(modalEl) {
    if (modalEl) {
      modalEl.style.display = "none";
    } else {
      document.querySelectorAll(".modal").forEach(m => m.style.display = "none");
    }
  }

  // Create button
  createBtn.addEventListener("click", () => {
    currentEditId = null;
    modalTitle.textContent = "Create New Announcement";
    form.reset();
    document.getElementById("announcement-audience").value = "all_users";
    document.getElementById("announcement-status").value = "published";
    openModal(announcementModal);
  });

  // Close buttons
  document.querySelectorAll(".modal .close-modal").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const modalEl = e.target.closest(".modal");
      closeModal(modalEl);
    });
  });

  const cancelBtn = document.getElementById("cancel-announcement");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", (e) => {
      const modalEl = e.target.closest(".modal");
      closeModal(modalEl);
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal")) {
      closeModal(e.target);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // ---------------- Edit modal open ----------------
  function openEditModal(id, ann) {
    currentEditId = id;
    modalTitle.textContent = "Edit Announcement";

    document.getElementById("announcement-title").value = ann.title || "";
    document.getElementById("announcement-content").value = ann.content || "";
    document.getElementById("announcement-audience").value = ann.audience || "all_users";
    document.getElementById("announcement-status").value = ann.status || "published";

    openModal(announcementModal);
  }

  // ---------------- Filters & search ----------------
  searchInput.addEventListener("input", renderAnnouncements);
  statusFilter.addEventListener("change", renderAnnouncements);
  audienceFilter.addEventListener("change", renderAnnouncements);

  // ---------------- Utilities ----------------
  function formatAudience(a) {
    switch (a) {
      case "all_users": return "All Users";
      case "staff_only": return "Staff Only";
      case "members_only": return "Members Only";
      default: return "All Users";
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function capitalize(s) {
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
});
