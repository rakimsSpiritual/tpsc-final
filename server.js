// server.js
const express = require("express");
const fs = require("fs");
const https = require("https");
const { Server } = require("socket.io");
const path = require("path");

const app = express();

// --- HTTPS setup (Render auto SSL works with your domain) ---
// If you have SSL cert files locally (optional for local testing)
const options = {
  key: fs.existsSync("key.pem") ? fs.readFileSync("key.pem") : null,
  cert: fs.existsSync("cert.pem") ? fs.readFileSync("cert.pem") : null,
};

const server = options.key && options.cert
  ? https.createServer(options, app)
  : require("http").createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// HBS setup
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

// Routes
app.get("/", (req, res) => res.redirect("/sign"));
app.get("/sign", (req, res) => res.render("signin"));
app.get("/appHome", (req, res) => res.render("appHome"));

// Meetings store: { meetingID: { socketID: userID } }
const meetings = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // User joins meeting
  socket.on("joinMeeting", ({ meetingID, userID }) => {
    socket.join(meetingID);
    socket.userID = userID;
    socket.meetingID = meetingID;

    if (!meetings[meetingID]) meetings[meetingID] = {};
    meetings[meetingID][socket.id] = userID;

    // Send updated participant list to all in meeting
    io.to(meetingID).emit("newParticipant", {
      participants: Object.values(meetings[meetingID]),
      userID,
      socketID: socket.id
    });
  });

  // Forward WebRTC signaling
  socket.on("signal", ({ targetID, fromID, signal }) => {
    io.to(targetID).emit("signal", { fromID, signal });
  });

  // Chat messages
  socket.on("sendMessage", ({ meetingID, userID, msg }) => {
    io.to(meetingID).emit("receiveMessage", { userID, msg });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const { meetingID, userID } = socket;
    if (meetingID && meetings[meetingID]) {
      delete meetings[meetingID][socket.id];
      io.to(meetingID).emit("participantLeft", { userID, socketID: socket.id });
    }
    console.log("User disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
