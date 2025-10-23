// ====================== Messages.js ======================
// Requires: Firebase Auth + Database
// Shared by Admin / Staff / Member panels

document.addEventListener("DOMContentLoaded", () => {
    // -------------------- ELEMENTS --------------------
    const chatListEl = document.querySelector("#chat-list");
    const chatWindowEl = document.querySelector("#chat-window");
    const chatMessagesEl = document.querySelector("#chat-messages");
    const chatHeaderEl = document.querySelector("#chat-header");
    const chatInputEl = document.querySelector("#message-input");
    const chatSendBtn = document.querySelector("#send-btn");
    const searchInputEl = document.querySelector("#search-input");
    const searchResultsEl = document.querySelector("#search-results");

    let currentUser = null;
    let activeThreadId = null;

    // -------------------- AUTH --------------------
    auth.onAuthStateChanged(user => {
        if (!user) {
            window.location.href = "../index.html"; // redirect if not logged in
        } else {
            currentUser = user;
            loadChatThreads();
        }
    });

    // -------------------- LOAD CHAT THREADS --------------------
    function loadChatThreads() {
        const threadsRef = database.ref("chatThreads");

        // Remove previous listener to avoid duplicates
        threadsRef.off();

        threadsRef.on("value", snapshot => {
            // Clear existing threads
            chatListEl.querySelectorAll(".chat-thread").forEach(e => e.remove());

            snapshot.forEach(threadSnap => {
                const thread = threadSnap.val();
                if (!thread.members || !thread.members[currentUser.uid]) return;

                const otherUserId = Object.keys(thread.members).find(uid => uid !== currentUser.uid);
                if (!otherUserId) return;

                database.ref(`users/${otherUserId}`).once("value").then(userSnap => {
                    const otherUser = userSnap.val();
                    const lastMsg = thread.lastMessage || {};
                    const unreadCount = thread.unreadCounts?.[currentUser.uid] || 0;

                    // Avoid duplicate DOM elements
                    if (chatListEl.querySelector(`[data-thread-id="${threadSnap.key}"]`)) return;

                    const threadEl = document.createElement("div");
                    threadEl.classList.add("chat-thread");
                    threadEl.dataset.threadId = threadSnap.key;
                    threadEl.innerHTML = `
                        <div class="avatar">${otherUser.name.charAt(0)}</div>
                        <div class="thread-info">
                            <div class="name">${otherUser.name}</div>
                            <div class="last-message">${lastMsg.text || ""}</div>
                        </div>
                        ${unreadCount > 0 ? `<div class="unread-count">${unreadCount}</div>` : ""}
                    `;
                    threadEl.addEventListener("click", () => {
                        setActiveThread(threadEl);
                        openThread(threadSnap.key, otherUser.name);
                    });
                    chatListEl.appendChild(threadEl);
                });
            });
        });
    }

    // Highlight the active thread
    function setActiveThread(threadEl) {
        chatListEl.querySelectorAll(".chat-thread").forEach(t => t.classList.remove("active"));
        threadEl.classList.add("active");
    }

    // -------------------- OPEN THREAD --------------------
    function openThread(threadId, threadName) {
        activeThreadId = threadId;
        chatHeaderEl.textContent = threadName;
        chatMessagesEl.innerHTML = "";

        // Reset unread count for current user
        database.ref(`chatThreads/${threadId}/unreadCounts/${currentUser.uid}`).set(0);

        const messagesRef = database.ref(`messages/${threadId}`);
        messagesRef.off();
        messagesRef.on("child_added", snap => {
            const msg = snap.val();
            displayMessage(msg);
        });
    }

    // -------------------- DISPLAY MESSAGE --------------------
    function displayMessage(msg) {
        const msgEl = document.createElement("div");
        msgEl.classList.add("message");
        msgEl.classList.add(msg.senderId === currentUser.uid ? "sent" : "received");

        // Format timestamp to human-readable string
        const time = new Date(msg.timestamp);
        const formattedTime = time.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        // Message content + timestamp
        msgEl.innerHTML = `
            <span class="message-text">${msg.text}</span>
            <span class="message-time">${formattedTime}</span>
        `;

        chatMessagesEl.appendChild(msgEl);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }

    // -------------------- SEND MESSAGE --------------------
    chatSendBtn.addEventListener("click", sendMessage);
    chatInputEl.addEventListener("keypress", e => {
        if (e.key === "Enter") sendMessage();
    });

    function sendMessage() {
        const text = chatInputEl.value.trim();
        if (!text || !activeThreadId) return;

        const msg = {
            text,
            senderId: currentUser.uid,
            timestamp: Date.now()
        };

        const newMsgRef = database.ref(`messages/${activeThreadId}`).push();
        newMsgRef.set(msg);

        // Update last message in thread
        const threadRef = database.ref(`chatThreads/${activeThreadId}`);
        threadRef.update({ lastMessage: msg });

        // Increment unread count for other members
        threadRef.child("members").once("value").then(snapshot => {
            snapshot.forEach(memberSnap => {
                const uid = memberSnap.key;
                if (uid !== currentUser.uid) {
                    threadRef.child(`unreadCounts/${uid}`).transaction(count => (count || 0) + 1);
                }
            });
        });

        chatInputEl.value = "";
    }

    // -------------------- SEARCH USERS --------------------
    searchInputEl.addEventListener("input", () => {
        const query = searchInputEl.value.toLowerCase().trim();
        searchResultsEl.innerHTML = "";
        if (!query) return;

        database.ref("users").orderByChild("name").once("value").then(snapshot => {
            snapshot.forEach(userSnap => {
                const user = userSnap.val();
                const uid = userSnap.key;
                if (uid === currentUser.uid) return; // skip self
                if (!user.name.toLowerCase().includes(query)) return;

                const userEl = document.createElement("div");
                userEl.classList.add("search-result");
                userEl.innerHTML = `
                    <div class="avatar">${user.name.charAt(0)}</div>
                    <div class="name">${user.name}</div>
                `;
                userEl.addEventListener("click", () => startOrOpenThread(uid, user.name));
                searchResultsEl.appendChild(userEl);
            });
        });
    });

    // -------------------- START OR OPEN THREAD --------------------
    function startOrOpenThread(otherUserId, otherUserName) {
        database.ref("chatThreads").once("value").then(snapshot => {
            let threadId = null;

            snapshot.forEach(threadSnap => {
                const thread = threadSnap.val();
                const members = thread.members ? Object.keys(thread.members) : [];
                if (members.includes(currentUser.uid) && members.includes(otherUserId)) {
                    threadId = threadSnap.key;
                }
            });

            if (!threadId) {
                const newThreadRef = database.ref("chatThreads").push();
                newThreadRef.set({
                    members: {
                        [currentUser.uid]: true,
                        [otherUserId]: true
                    },
                    unreadCounts: {
                        [currentUser.uid]: 0,
                        [otherUserId]: 0
                    }
                });
                threadId = newThreadRef.key;
            }

            openThread(threadId, otherUserName);
            searchResultsEl.innerHTML = "";
            searchInputEl.value = "";
            loadChatThreads();
        });
    }
});
