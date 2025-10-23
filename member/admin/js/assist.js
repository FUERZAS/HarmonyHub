// assist.js - Handles AI Assistant (Gemini Chatbot)

document.addEventListener("DOMContentLoaded", () => {
  const chatBox = document.getElementById("chat-box");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");

  // ---- Auth Check ----
  auth.onAuthStateChanged((user) => {
    if (!user) {
      Swal.fire("Unauthorized", "Please log in first.", "error").then(() => {
        window.location.href = "../index.html";
      });
    }
  });

  // Append message to chat
  function appendMessage(sender, text) {
    const messageEl = document.createElement("div");
    messageEl.classList.add("message", sender);

    const avatar = document.createElement("div");
    avatar.classList.add("avatar");
    avatar.textContent = sender === "user" ? "👤" : "🤖";

    const textEl = document.createElement("div");
    textEl.classList.add("text");
    textEl.textContent = text;

    messageEl.appendChild(avatar);
    messageEl.appendChild(textEl);

    chatBox.appendChild(messageEl);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Send message handler
  async function sendMessage() {
    const query = userInput.value.trim();
    if (!query) return;

    appendMessage("user", query);
    userInput.value = "";

    const loadingEl = document.createElement("div");
    loadingEl.classList.add("message", "bot");
    loadingEl.innerHTML = `<div class="avatar">🤖</div><div class="text">Thinking...</div>`;
    chatBox.appendChild(loadingEl);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      // ✅ Use relative URL so it works locally & in deployment
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });

      const data = await response.json();
      loadingEl.remove();

      if (data.reply) {
        appendMessage("bot", data.reply);
      } else {
        appendMessage("bot", "⚠️ No response from Gemini.");
      }
    } catch (error) {
      console.error("Backend Error:", error);
      loadingEl.remove();
      appendMessage("bot", "⚠️ Error connecting to Gemini server.");
    }
  }

  // Event listeners
  sendBtn.addEventListener("click", sendMessage);
  userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Focus input on load
  userInput.focus();
});
