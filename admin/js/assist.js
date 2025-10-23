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
    // Render bot replies as lightweight Markdown -> HTML, but keep user text as plain text
    if (sender === 'bot') {
      textEl.innerHTML = renderMarkdownToHtml(text);
    } else {
      textEl.textContent = text;
    }

    messageEl.appendChild(avatar);
    messageEl.appendChild(textEl);

    chatBox.appendChild(messageEl);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Very small, safe Markdown -> HTML renderer (supports headings, bold, italic, unordered lists, line breaks)
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function (m) {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }

  function renderMarkdownToHtml(md) {
    if (!md) return '';
    // Escape first
    let s = escapeHtml(md);

    // Convert code fences (``` ) to pre blocks (simple)
    s = s.replace(/```([\s\S]*?)```/g, function(_, code) {
      return '<pre>' + escapeHtml(code) + '</pre>';
    });

    // Headings
    s = s.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    s = s.replace(/^# (.*)$/gm, '<h1>$1</h1>');

    // Bold **text** and italics *text*
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Unordered lists (lines starting with - or *)
    // Convert contiguous list lines into <ul>
    s = s.replace(/(^((?:[\-\*] .*(\r?\n)?)+))/gm, function(match) {
      const items = match.trim().split(/\r?\n/).map(line => line.replace(/^[\-\*] /, '').trim());
      return '<ul>' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
    });

    // Paragraphs: replace double newlines with </p><p>
    s = s.replace(/\r?\n\r?\n/g, '</p><p>');

    // Single newlines -> <br>
    s = s.replace(/\r?\n/g, '<br>');

    // Wrap in a paragraph if it doesn't start with block element
    if (!/^\s*<(h1|h2|h3|ul|pre|p)/i.test(s)) {
      s = '<p>' + s + '</p>';
    }

    return s;
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
