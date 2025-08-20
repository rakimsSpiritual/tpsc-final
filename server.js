// server.js
const express = require("express");
const fs = require("fs");
const https = require("https");
const socketIO = require("socket.io");
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

const io = socketIO(server, {
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

    // Get existing participants
    const participants = Object.values(meetings[meetingID]);
    
    // Send existing participants to the new user
    socket.emit("existingParticipants", participants);
    
    // Notify others about the new user (except the new user themselves)
    socket.to(meetingID).emit("userJoined", { userID });
    
    console.log(`User ${userID} joined meeting ${meetingID}. Participants:`, participants);
  });

  // Forward WebRTC signaling (compatible with SimplePeer)
  socket.on("signal", ({ to, from, data }) => {
    io.to(to).emit("signal", { from, data });
  });

  // Chat messages (updated to match client)
  socket.on("sendMessage", ({ meetingID, user, message }) => {
    io.to(meetingID).emit("newMessage", { user, message });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const { meetingID, userID } = socket;
    
    if (meetingID && meetings[meetingID]) {
      delete meetings[meetingID][socket.id];
      
      // Notify others that user left
      socket.to(meetingID).emit("userLeft", { userID });
      
      // Clean up empty meetings
      if (Object.keys(meetings[meetingID]).length === 0) {
        delete meetings[meetingID];
      }
    }
    
    console.log("User disconnected:", socket.id, userID);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
