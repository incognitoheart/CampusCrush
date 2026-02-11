let socket;
let joined = false;
let userGender = null;
let lookingFor = null;
let chatActive = false;
const GIPHY_API_KEY = "D4HiQM41oSrFcA0JG7VTQf4zYlDMmoLM";
let emojiList = [];
async function loadEmojis() {
  const res = await fetch(
    "https://raw.githubusercontent.com/iamcal/emoji-data/master/emoji.json"
  );
  emojiList = await res.json();
}
function setGender(gender) {
  userGender = gender;
  highlightSelection(event.target);
}
function setLookingFor(target) {
  lookingFor = target;
  highlightSelection(event.target);
}
function highlightSelection(button) {
  const group = button.parentElement;
  group.querySelectorAll("button").forEach((btn) => {
    btn.style.opacity = "0.5";
  });
  button.style.opacity = "1";
}
let currentEmojiCategory = "Smileys & Emotion"; // Change from "smileys" to "Smileys & Emotion"
let gifSearchTimeout = null;
function mapCategoryName(displayName) {
  const categoryMap = {
    "Smileys & Emotion": "Smileys & Emotion",
    "People & Body": "People & Body",
    "Activities": "Activities",
    "Food & Drink": "Food & Drink",
    "Travel & Places": "Travel & Places",
    "Objects": "Objects"
  };
  return categoryMap[displayName] || "Smileys & Emotion";
}
function initEmojiPicker() {
  const categoryBtns = document.querySelectorAll(".emoji-category-btn");
  categoryBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      categoryBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const category = btn.getAttribute("data-category");
      currentEmojiCategory = mapCategoryName(category);
      renderEmojis();
    });
  });
  renderEmojis();
}
function renderEmojis() {
  const grid = document.getElementById("emojiGrid");
  if (!grid) return;
  
  grid.innerHTML = "";

  const filtered = emojiList.filter(e => e.category === currentEmojiCategory && e.unified);
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">No emojis found</div>';
    return;
  }

  filtered.slice(0, 64).forEach(e => {
    const emoji = String.fromCodePoint(
      ...e.unified.split("-").map(u => parseInt(u, 16))
    );
    const item = document.createElement("div");
    item.className = "emoji-item";
    item.textContent = emoji;
    item.onclick = () => insertEmoji(emoji);

    grid.appendChild(item);
  });
}
function toggleEmojiPicker() {
  const emojiPicker = document.getElementById("emojiPicker");
  const gifPicker = document.getElementById("gifPicker");
  gifPicker.classList.remove("active");
  emojiPicker.classList.toggle("active");
}
function toggleGifPicker() {
  const emojiPicker = document.getElementById("emojiPicker");
  const gifPicker = document.getElementById("gifPicker");
  emojiPicker.classList.remove("active");
  gifPicker.classList.toggle("active");
  if (gifPicker.classList.contains("active")) {
    loadTrendingGifs();
  }
}
function insertEmoji(emoji) {
  const input = document.getElementById("msg");
  input.value += emoji;
  input.focus();
}
async function searchGifs(query) {
  const grid = document.getElementById("gifGrid");
  grid.innerHTML = '<div class="gif-loading">Searching GIFs...</div>';

  try {
    const q = query || "excited";
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=pg`;

    const res = await fetch(url);
    const data = await res.json();
    displayGifs(data.data);
  } catch (err) {
    grid.innerHTML = '<div class="gif-loading">Failed to load GIFs 😔</div>';
  }
}
async function loadTrendingGifs() {
  const grid = document.getElementById("gifGrid");
  grid.innerHTML = '<div class="gif-loading">Loading trending GIFs...</div>';

  try {
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg`;
    const res = await fetch(url);
    const data = await res.json();
    displayGifs(data.data);
  } catch (err) {
    grid.innerHTML = '<div class="gif-loading">Failed to load GIFs 😔</div>';
  }
}
function displayGifs(gifs) {
  const grid = document.getElementById("gifGrid");
  grid.innerHTML = "";

  if (!gifs || gifs.length === 0) {
    grid.innerHTML = '<div class="gif-loading">No GIFs found</div>';
    return;
  }

  gifs.forEach((gif) => {
    const item = document.createElement("div");
    item.className = "gif-item";

    const img = document.createElement("img");
    img.src = gif.images.fixed_width_small.url;
    img.alt = gif.title || "GIF";

    item.appendChild(img);
    item.onclick = () =>
      sendGif(gif.images.original.url, gif.title);

    grid.appendChild(item);
  });
}
function playBeep() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
  oscillator.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.2);
}
function sendGif(gifUrl, description) {
  if (!chatActive || !socket) return;
  const gifData = {
    type: "gif",
    url: gifUrl,
    description: description || "GIF",
  };
  socket.emit("message", gifData);
  addGifMessage(gifData, "sent");
  document.getElementById("gifPicker").classList.remove("active");
}
function updateIndiaTime() {
  const now = new Date();
  const indiaDate = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const hours = indiaDate.getHours();
  return hours;
}
document.addEventListener("DOMContentLoaded", async () => {
  const indiaHour = updateIndiaTime();
  if (!(indiaHour >= 12 || indiaHour === 23)) {
    window.location.href = "https://campuscrush-bvws.onrender.com/index2.html";
    return;
  }
  document.body.style.display = "flex";
  await loadEmojis();
  initEmojiPicker();
  const gifSearchInput = document.getElementById("gifSearch");
  if (gifSearchInput) {
    gifSearchInput.addEventListener("input", (e) => {
      clearTimeout(gifSearchTimeout);
      gifSearchTimeout = setTimeout(() => {
        const query = e.target.value.trim();
        if (query) {
          searchGifs(query);
        } else {
          loadTrendingGifs();
        }
      }, 500);
    });
  }
  document.addEventListener("click", (e) => {
    const emojiPicker = document.getElementById("emojiPicker");
    const gifPicker = document.getElementById("gifPicker");
    const emojiBtn = document.querySelector(".emoji-btn");
    const gifBtn = document.querySelector(".gif-btn");
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.remove("active");
    }
    if (
      !gifPicker.contains(e.target) &&
      e.target !== gifBtn &&
      !gifBtn.contains(e.target)
    ) {
      gifPicker.classList.remove("active");
    }
  });
});
async function startMatching() {
  if (joined) return;
  if (!userGender || !lookingFor) {
    alert("Please select both options ❤️");
    return;
  }
  joined = true;
  document.getElementById("welcome").style.display = "none";
  document.getElementById("searching").style.display = "block";
  try {
    socket = io();
    socket.emit("join", {
      gender: userGender,
      lookingFor: lookingFor,
    });
    socket.on("waiting", ({ participantCount }) => {
      document.getElementById("participantCount").textContent = participantCount;
      document.getElementById("searching").innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <p style="color:#667eea;font-weight:600;">Finding your match...</p>
          <p style="color: #999; font-size: 0.9em; margin-top: 10px">
          </p>
        </div>
      `;
    });
    socket.on("update_participant_count", ({ participantCount }) => {
      document.getElementById("participantCount").textContent = participantCount;
    });
    socket.on("matched", () => {
      playBeep();
      chatActive = true;
      document.getElementById("searching").style.display = "none";
      document.getElementById("chat").style.display = "block";
      addSystemMessage("🎉 You're matched! Say hi!");
      document.getElementById("msg").focus();
    });
    socket.on("message", (msg) => {
      if (typeof msg === "object" && msg.type === "gif") {
        addGifMessage(msg, "received");
      } else {
        addMessage(msg, "received");
      }
    });
    socket.on("partner_left", () => {
      chatActive = false;
      addSystemMessage("💔 Stranger left. Finding new match...");
      document.getElementById("chat").style.display = "none";
      document.getElementById("searching").style.display = "block";
      document.getElementById("messages").innerHTML = "";
    });
    socket.on("connect_error", () => {
      alert("Connection failed. Refresh and try again.");
      resetToWelcome();
    });
  } catch (err) {
    console.error(err);
    alert("Something went wrong.");
    resetToWelcome();
  }
}
function resetToWelcome() {
  joined = false;
  chatActive = false;
  document.getElementById("searching").style.display = "none";
  document.getElementById("chat").style.display = "none";
  document.getElementById("welcome").style.display = "block";
}
function sendMessage() {
  const input = document.getElementById("msg");
  const message = input.value.trim();
  if (!message || !chatActive || !socket) return;
  socket.emit("message", message);
  addMessage(message, "sent");
  input.value = "";
  input.focus();
  document.getElementById("emojiPicker").classList.remove("active");
  document.getElementById("gifPicker").classList.remove("active");
}
function skipPartner() {
  if (!socket) return;
  if (
    confirm(
      "Are you sure you want to find a new match? This conversation will end.",
    )
  ) {
    chatActive = false;
    document.getElementById("messages").innerHTML = "";
    document.getElementById("chat").style.display = "none";
    document.getElementById("searching").style.display = "block";
    socket.emit("skip");
  }
}
function handleKeyPress(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
}
function addMessage(text, type) {
  const messagesDiv = document.getElementById("messages");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}`;
  const now = new Date();
  const time = now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
  messageDiv.innerHTML = `
        <div class="bubble">${escapeHtml(text)}</div>
        <div class="time">${time}</div>
      `;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
function addGifMessage(gifData, type) {
  const messagesDiv = document.getElementById("messages");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}`;
  const now = new Date();
  const time = now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
  messageDiv.innerHTML = `
        <div class="bubble">
          <div class="gif-message">
            <img src="${escapeHtml(gifData.url)}" alt="${escapeHtml(gifData.description)}" loading="lazy" />
          </div>
        </div>
        <div class="time">${time}</div>
      `;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
function addSystemMessage(text) {
  const messagesDiv = document.getElementById("messages");
  const messageDiv = document.createElement("div");
  messageDiv.className = "system-msg";
  messageDiv.textContent = text;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
const observer = new MutationObserver(() => {
  const chat = document.getElementById("chat");
  if (chat.style.display !== "none") {
    document.getElementById("msg").focus();
  }
});
observer.observe(document.getElementById("chat"), {
  attributes: true,
  attributeFilter: ["style"],
});
window.addEventListener("beforeunload", () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
});