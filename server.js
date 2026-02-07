const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const { v4: uuid } = require("uuid");
require("dotenv").config();
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));
app.use(cors());
app.set("trust proxy", true);
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const messageSchema = new mongoose.Schema({
  chatId: String,
  timestamp: Date,
  sender: {
    socketId: String,
    ipAddress: String,
  },
  receiver: {
    socketId: String,
    ipAddress: String,
  },
  text: String,
  messageTimestamp: Date,
});
const Message = mongoose.model("Message", messageSchema);
const chatSessionSchema = new mongoose.Schema({
  chatId: String,
  startTime: Date,
  endTime: Date,
  participants: {
    sender: {
      socketId: String,
      ipAddress: String,
    },
    receiver: {
      socketId: String,
      ipAddress: String,
    },
  },
  messageCount: Number,
});
const ChatSession = mongoose.model("ChatSession", chatSessionSchema);
class PriorityQueue {
  constructor() {
    this.users = [];
  }
  enqueue(user, priority = 0) {
    this.users.push({ user, priority });
    this.users.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.users.shift();
  }
  remove(userId) {
    this.users = this.users.filter(item => item.user.id !== userId);
  }
  getByGenderAndPreference(lookingFor) {
    return this.users.filter(
      item =>
        (lookingFor === "any" ||
          lookingFor === item.user.gender) &&
        item.user.lookingFor !== undefined
    );
  }
  size() {
    return this.users.length;
  }
}
const waitingQueue = new PriorityQueue();
io.on("connection", (socket) => {
  socket.messages = [];
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  socket.ipAddress = forwarded
    ? forwarded.split(",")[0].trim()
    : socket.handshake.address;
  socket.on("join", ({ gender, lookingFor }) => {
    if (socket.joined) return;
    socket.joined = true;
    socket.gender = gender;
    socket.lookingFor = lookingFor;
    socket.chatId = uuid();
    let matchedIndex = -1;
    for (let i = 0; i < waitingQueue.users.length; i++) {
      const partner = waitingQueue.users[i].user;
      if (isCompatible(socket, partner) && partner.id !== socket.id) {
        matchedIndex = i;
        break;
      }
    }
    if (matchedIndex !== -1) {
      const matchedItem = waitingQueue.users.splice(matchedIndex, 1)[0];
      pair(socket, matchedItem.user);
    } else {
      waitingQueue.enqueue(socket, 0);
      const participantCount = getParticipantCount(socket.lookingFor);
      socket.emit("waiting", { participantCount });
      updateWaitingParticipantCounts();
    }
  });
  socket.on("message", async (msg) => {
    if (socket.room) {
      socket.messages.push({
        sender: socket.id,
        text: msg,
        timestamp: new Date().toISOString()
      });
      try {
        const message = new Message({
          chatId: socket.chatId,
          timestamp: new Date(),
          sender: {
            socketId: socket.id,
            ipAddress: socket.ipAddress,
          },
          receiver: {
            socketId: socket.partner.id,
            ipAddress: socket.partner.ipAddress,
          },
          text: msg,
          messageTimestamp: new Date(),
        });
        await message.save();
      } catch (err) {
        console.error("Error saving message to MongoDB:", err);
      }
      socket.to(socket.room).emit("message", msg);
    }
  });
  socket.on("skip", () => {
    saveChat(socket);
    const partner = socket.partner;
    cleanup(socket);
    let matchedIndex = -1;
    for (let i = 0; i < waitingQueue.users.length; i++) {
      const candidate = waitingQueue.users[i].user;
      if (isCompatible(socket, candidate) && candidate.id !== socket.id && candidate.id !== partner?.id) {
        matchedIndex = i;
        break;
      }
    }
    if (matchedIndex !== -1) {
      const matchedItem = waitingQueue.users.splice(matchedIndex, 1)[0];
      socket.messages = [];
      socket.chatId = uuid();
      pair(socket, matchedItem.user);
      if (partner) {
        waitingQueue.enqueue(partner, 0);
        const partnerParticipantCount = getParticipantCount(partner.lookingFor);
        partner.emit("waiting", { participantCount: partnerParticipantCount });
      }
    } else if (partner) {
      const compatibleMatches = waitingQueue.getByGenderAndPreference(socket.lookingFor);
      if (compatibleMatches.length === 0) {
        socket.messages = [];
        partner.messages = [];
        socket.chatId = uuid();
        partner.chatId = socket.chatId;
        pair(socket, partner);
      } else {
        waitingQueue.enqueue(socket, 0);
        const participantCount = getParticipantCount(socket.lookingFor);
        socket.emit("waiting", { participantCount });
      }
    } else {
      waitingQueue.enqueue(socket, 0);
      const participantCount = getParticipantCount(socket.lookingFor);
      socket.emit("waiting", { participantCount });
    }
    updateWaitingParticipantCounts();
  });
  socket.on("disconnect", () => {
    saveChat(socket);
    cleanup(socket);
  });
})
function isCompatible(a, b) {
  const aAcceptsB =
    a.lookingFor === "any" || a.lookingFor === b.gender;
  const bAcceptsA =
    b.lookingFor === "any" || b.lookingFor === a.gender;
  return aAcceptsB && bAcceptsA;
}
function pair(a, b) {
  const room = `room-${a.id}-${b.id}`;
  a.join(room);
  b.join(room);
  a.room = room;
  b.room = room;
  a.partner = b;
  b.partner = a;
  if (!b.chatId) {
    b.chatId = a.chatId;
  }
  a.emit("matched");
  b.emit("matched");
}
function cleanup(socket) {
  waitingQueue.remove(socket.id);
  if (socket.room) {
    socket.to(socket.room).emit("partner_left");
    socket.leave(socket.room);
    socket.room = null;
  }
}
async function saveChat(socket) {
  if (!socket.messages || socket.messages.length === 0) {
    return;
  }
  try {
    const chatSession = new ChatSession({
      chatId: socket.chatId,
      startTime: new Date(),
      endTime: new Date(),
      participants: {
        sender: {
          socketId: socket.id,
          ipAddress: socket.ipAddress,
        },
        receiver: socket.partner ? {
          socketId: socket.partner.id,
          ipAddress: socket.partner.ipAddress,
        } : null,
      },
      messageCount: socket.messages.length,
    });
    await chatSession.save();
  } catch (err) {
    console.error("Error saving chat session to MongoDB:", err);
  }
}
function getParticipantCount(lookingFor) {
  const matchingUsers = waitingQueue.getByGenderAndPreference(lookingFor);
  return matchingUsers.length;
}
function updateWaitingParticipantCounts() {
  waitingQueue.users.forEach(item => {
    const participantCount = getParticipantCount(item.user.lookingFor);
    item.user.emit("update_participant_count", { participantCount });
  });
}
server.listen(3000, "0.0.0.0",() => {
  console.log("Server running on http://localhost:3000");
});