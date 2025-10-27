// ================================
// Staff Announcements Page Script
// Requires: Firebase Auth + Database + SweetAlert2
// Permission required: /canAnnounce = true
// ================================
document.addEventListener("DOMContentLoaded", () => {
  const auth = firebase.auth();
  const database = firebase.database();

  // ---------- ELEMENT REFERENCES ----------
  const cardsContainer = document.querySelector(".cards-container");
  const searchInput = document.getElementById("announcement-search");
  const filterSelect = document.getElementById("status-filter");
  const loadingIndicator = document.querySelector(".loading-indicator");
  const noDataMessage = document.querySelector(".no-data-message");

  const modal = document.getElementById("announcement-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalForm = document.getElementById("announcement-form");
  const closeModalBtn = document.querySelector(".close-modal");

  const titleField = document.getElementById("announcement-title");
  const contentField = document.getElementById("announcement-content");
  const audienceField = document.getElementById("announcement-audience");
  const statusField = document.getElementById("announcement-status");
  const categoryField = document.getElementById("announcement-category");
  const priorityField = document.getElementById("announcement-priority");
  const previewContent = document.getElementById("preview-content");
  const previewText = document.querySelector(".preview-text");

  const createBtn = document.getElementById("create-announcement-btn");
  const previewBtn = document.getElementById("preview-btn");

  const announcementsRef = database.ref("announcements");

  let editingId = null;
  let canAnnounce = false;
  let currentUserData = null;

  // ---------- AUTH & PERMISSION CHECK ----------
  auth.onAuthStateChanged((user) => {
    if (!user) {
      Swal.fire("Unauthorized", "Please log in first.", "error").then(() => {
        window.location.href = "../index.html";
      });
      return;
    }

    database.ref(`users/${user.uid}`).once("value")
      .then((snap) => {
        const userData = snap.val() || {};
        currentUserData = userData;
        const role = userData.role || "member";
        canAnnounce = userData.permissions?.canAnnounce === true;

        if (role !== "staff") {
          Swal.fire("Unauthorized", "You are not authorized to access this page!", "error")
            .then(() => (window.location.href = "../index.html"));
          return;
        }

        // Hide CRUD buttons if not allowed
        if (!canAnnounce && createBtn) {
          createBtn.style.display = "none";
        }

        loadAnnouncements();
      })
      .catch((err) => {
        console.error(err);
        Swal.fire("Error", "Failed to verify your access.", "error").then(() => {
          window.location.href = "../index.html";
        });
      });
  });

  // ---------- LOAD ANNOUNCEMENTS ----------
  function loadAnnouncements() {
    loadingIndicator.style.display = "block";
    cardsContainer.innerHTML = "";

    // Use child listeners for incremental updates and lower initial render cost
    const frag = document.createDocumentFragment();
    const itemsMap = new Map();

    announcementsRef.orderByChild('timestamp').limitToLast(200).once('value').then(snapshot => {
      loadingIndicator.style.display = 'none';
      if (!snapshot.exists()) {
        noDataMessage.style.display = 'block';
        return;
      }

      noDataMessage.style.display = 'none';
      snapshot.forEach(child => {
        const data = child.val();
        if (!data) return;
        itemsMap.set(child.key, { id: child.key, ...data });
      });

      // render initial batch
      const arr = Array.from(itemsMap.values()).sort((a,b) => b.timestamp - a.timestamp);
      arr.forEach(a => frag.appendChild(renderAnnouncementCard(a)));
      cardsContainer.appendChild(frag);

      // then attach child listeners for live updates
      announcementsRef.on('child_added', snap => {
        const data = snap.val();
        if (!data) return;
        itemsMap.set(snap.key, { id: snap.key, ...data });
        // prepend newest
        const node = renderAnnouncementCard({ id: snap.key, ...data });
        cardsContainer.prepend(node);
      });

      announcementsRef.on('child_changed', snap => {
        const data = snap.val();
        if (!data) return;
        itemsMap.set(snap.key, { id: snap.key, ...data });
        // replace existing card
        const existing = cardsContainer.querySelector(`.announcement-card[data-id="${snap.key}"]`);
        const newNode = renderAnnouncementCard({ id: snap.key, ...data });
        if (existing && existing.parentNode) existing.parentNode.replaceChild(newNode, existing);
      });

      announcementsRef.on('child_removed', snap => {
        const existing = cardsContainer.querySelector(`.announcement-card[data-id="${snap.key}"]`);
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      });
    }).catch(err => {
      loadingIndicator.style.display = 'none';
      console.error('Failed to load announcements:', err);
    });
  }

  // ---------- DISPLAY ANNOUNCEMENTS ----------
  function displayAnnouncements(list) {
    cardsContainer.innerHTML = "";

    list.forEach((ann) => {
      const card = renderAnnouncementCard(ann);

      cardsContainer.appendChild(card);
    });
  }

  // helper that returns a card element and wires local handlers
  function renderAnnouncementCard(ann) {
    const card = document.createElement('div');
    card.classList.add('announcement-card');
    card.dataset.id = ann.id;

    const statusClass = ann.status || 'unknown';
    const date = ann.date ? new Date(ann.date).toLocaleString() : 'Unknown';

    let audienceText = 'All';
    switch (ann.audience) {
      case 'members_only': audienceText = 'Members Only'; break;
      case 'staff_only': audienceText = 'Staff Only'; break;
      case 'all_users': audienceText = 'All Users'; break;
    }

    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${ann.title || 'Untitled'}</h3>
        <span class="card-status ${statusClass}">${ann.status || 'Unknown'}</span>
      </div>
      <div class="card-body">
        <p class="card-audience"><strong>Audience:</strong> ${audienceText}</p>
        <p class="card-date"><strong>Date:</strong> ${date}</p>
        <div class="card-message">${ann.content ? escapeHtml(ann.content) : ''}</div>
        <p class="card-views"><strong>Views:</strong> ${Number(ann.views || 0)}</p>
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary btn-sm view-btn">View</button>
        ${canAnnounce ? `
          <button class="btn btn-primary btn-sm edit-btn">Edit</button>
          <button class="btn btn-danger btn-sm delete-btn">Delete</button>
          <button class="btn btn-success btn-sm publish-btn">Publish</button>
          <button class="btn btn-warning btn-sm unpublish-btn">Unpublish</button>
        ` : ''}
      </div>
    `;

    // view
    card.querySelector('.view-btn').addEventListener('click', () => viewAnnouncement(ann.id));

    if (canAnnounce) {
      card.querySelector('.edit-btn')?.addEventListener('click', () => editAnnouncement(ann.id));
      card.querySelector('.delete-btn')?.addEventListener('click', () => deleteAnnouncement(ann.id));
      card.querySelector('.publish-btn')?.addEventListener('click', () => setAnnouncementStatus(ann.id, 'published'));
      card.querySelector('.unpublish-btn')?.addEventListener('click', () => setAnnouncementStatus(ann.id, 'draft'));
    }

    return card;
  }

  // simple HTML escape to reduce XSS when rendering staff content
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // remove repeated leading 'New Announcement' prefixes from titles
  function stripLeadingNewAnnouncementPrefix(s) {
    if (!s) return '';
    return String(s).replace(/^\s*(new\s*announcement\s*[:\-–—]?\s*)/i, '').trim();
  }

  // publish/unpublish helper
  function setAnnouncementStatus(id, newStatus) {
    if (!canAnnounce) return Swal.fire('Unauthorized', 'You cannot change announcement status.', 'error');
    announcementsRef.child(id).update({ status: newStatus, timestamp: Date.now() })
      .then(() => {
        // mirror to activity table for visibility
        const activityRef = database.ref('activity_table');
        activityRef.push({ type: 'announcement', title: `${newStatus === 'published' ? 'Published' : 'Updated'} Announcement`, relatedId: id, timestamp: Date.now() });
        Swal.fire('Updated', `Announcement marked as ${newStatus}`, 'success');
      }).catch(err => {
        console.error(err);
        Swal.fire('Error', 'Failed to update status', 'error');
      });
  }

  // ---------- CREATE / EDIT ----------
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      editingId = null;
      modalTitle.textContent = "Create Announcement";
      modalForm.reset();
      previewContent.style.display = "none";
      modal.style.display = "flex";
    });
  }

  closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  previewBtn.addEventListener("click", () => {
    const title = titleField.value.trim();
    const content = contentField.value.trim();
    const audience = audienceField.value;
    const status = statusField.value;
  const category = (categoryField && categoryField.value) || 'general';
  const priority = (priorityField && priorityField.value) || 'low';

    if (!title || !content) {
      Swal.fire("Missing Info", "Please fill out all fields before previewing.", "warning");
      return;
    }

    let audienceText = 'All';
    switch (audience) {
      case 'members_only': audienceText = 'Members Only'; break;
      case 'staff_only': audienceText = 'Staff Only'; break;
      case 'all_users': audienceText = 'All Users'; break;
    }

    previewContent.style.display = "block";
    previewContent.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <p class="audience"><strong>Audience:</strong> <span>${escapeHtml(audienceText)}</span></p>
      <p class="status"><strong>Status:</strong> <span>${escapeHtml(status || 'Unknown')}</span></p>
      <hr/>
      <div class="preview-text" style="text-align:left;">${escapeHtml(content)}</div>
    `;
  });

  modalForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!canAnnounce) {
      Swal.fire("Unauthorized", "You don't have permission to create or edit announcements.", "error");
      return;
    }

    const title = titleField.value.trim();
    const content = contentField.value.trim();
    const audience = audienceField.value;
    const status = statusField.value;

    if (!title || !content) {
      Swal.fire("Missing Info", "Please complete all fields.", "warning");
      return;
    }

    const now = Date.now();
    const isoDate = new Date(now).toISOString();

    const data = {
      title,
      content,
      audience,
      status,
      category,
      priority,
      date: isoDate,     // readable format
      timestamp: now,    // unified sorting format
    };

    try {
      if (editingId) {
        // === UPDATE EXISTING ANNOUNCEMENT ===
        await announcementsRef.child(editingId).update(data);

        // Update activity_table entry (optional if you want mirrored updates)
        const activityRef = database.ref("activity_table");
        const activitySnapshot = await activityRef
          .orderByChild("relatedId")
          .equalTo(editingId)
          .once("value");

        if (activitySnapshot.exists()) {
          activitySnapshot.forEach((child) => {
            child.ref.update({
                title: stripLeadingNewAnnouncementPrefix(title),
                message: content,
                timestamp: now,
              });
          });
        }

        Swal.fire("Updated!", "Announcement updated successfully.", "success");
        // clear editing state
        editingId = null;
      } else {
        // === CREATE NEW ANNOUNCEMENT ===
        // include author info in the announcement record
        const toStore = Object.assign({}, data, {
          authorName: currentUserData?.name || null,
          authorUid: auth.currentUser?.uid || null,
          author: currentUserData?.name || null,
        });
        const newAnnRef = await announcementsRef.push(toStore);

        // ✅ Log to activity_table (only for authorized announcers)
        if (canAnnounce) {
          const safeTitle = stripLeadingNewAnnouncementPrefix(title);
          const activityData = {
            type: "announcement",
            title: safeTitle,
            message: content,
            audience,
            category,
            priority,
            authorRole: "staff",
            authorName: currentUserData?.name || null,
            authorUid: auth.currentUser?.uid || null,
            relatedId: newAnnRef.key,
            timestamp: now,
          };

          await database.ref("activity_table").push(activityData);
        }

        Swal.fire("Created!", "Announcement created successfully.", "success");
        // clear editing state
        editingId = null;
      }

      modal.style.display = "none";
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Something went wrong while saving the announcement.", "error");
    }
  });

  // ---------- VIEW / EDIT / DELETE ----------
  function viewAnnouncement(id) {
    announcementsRef.child(id).once("value").then((snap) => {
      const ann = snap.val();
      if (!ann) return;

      let audienceText = "All";
      switch (ann.audience) {
        case "members_only":
          audienceText = "Members Only";
          break;
        case "staff_only":
          audienceText = "Staff Only";
          break;
        case "all_users":
            audienceText = "All Users";
      }

      const postedBy = ann.authorName || ann.authorUid || 'Unknown';
      const category = ann.category || 'General';
      const priority = ann.priority || 'low';
      Swal.fire({
        title: ann.title,
        html: `
          <p><strong>Audience:</strong> ${audienceText || "All"}</p>
          <p><strong>Status:</strong> ${ann.status || "Unknown"}</p>
          <p><strong>Date:</strong> ${ann.date ? new Date(ann.date).toLocaleString() : 'Unknown'}</p>
          <hr/>
          <p style="text-align:left;">${escapeHtml(ann.content)}</p>
          <p style="margin-top:12px;"><small>Posted by: ${escapeHtml(postedBy)} &nbsp; Category: ${escapeHtml(category)} &nbsp; Priority: ${escapeHtml(priority)}</small></p>
        `,
        width: 600,
      });
    });
  }

  function editAnnouncement(id) {
    announcementsRef.child(id).once("value").then((snap) => {
      const ann = snap.val();
      if (!ann) return;

      let audienceText = "All";
      switch (ann.audience) {
        case "members_only":
          audienceText = "Members Only";
          break;
        case "staff_only":
          audienceText = "Staff Only";
          break;
        case "all_users":
            audienceText = "All Users";
      }

      editingId = id;
      modalTitle.textContent = "Edit Announcement";
      titleField.value = ann.title;
      contentField.value = ann.content;
      // set the select value to the stored audience code (not human text)
      audienceField.value = ann.audience || "all_users";
      statusField.value = ann.status || "draft";
      modal.style.display = "flex";
    });
  }

  function deleteAnnouncement(id) {
    Swal.fire({
      title: "Are you sure?",
      text: "This announcement will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        announcementsRef.child(id).remove()
          .then(() => Swal.fire("Deleted!", "Announcement removed.", "success"))
          .catch(() => Swal.fire("Error", "Failed to delete announcement.", "error"));
      }
    });
  }

  // ---------- SEARCH & FILTER ----------
  searchInput?.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll(".announcement-card");

    cards.forEach((card) => {
      const title = card.querySelector(".card-title").textContent.toLowerCase();
      card.style.display = title.includes(query) ? "flex" : "none";
    });
  });

  filterSelect?.addEventListener("change", () => {
    const filter = filterSelect.value;
    const cards = document.querySelectorAll(".announcement-card");

    cards.forEach((card) => {
      const status = card.querySelector(".card-status").textContent.toLowerCase();
      card.style.display = filter === "all" || status === filter ? "flex" : "none";
    });
  });
});
