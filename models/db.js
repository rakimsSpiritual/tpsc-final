require('dotenv').config(); // Load environment variables first
const mongoose = require("mongoose");

// MongoDB connection URI (with fallback for development)
const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/EmployeeDB";

// Mongoose connection options
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
};

// Connection function with better error handling
async function connectDB() {
  try {
    await mongoose.connect(mongoURI, options);
    console.log("✅ MongoDB Connection Succeeded");
      
    // Connection events for better monitoring
    mongoose.connection.on("connected", () => {
      console.log("Mongoose connected to DB");
    });
    
    mongoose.connection.on("error", (err) => {
      console.error("Mongoose connection error:", err);
    });
    
    mongoose.connection.on("disconnected", () => {
      console.warn("Mongoose disconnected from DB");
    });
    
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err.message);
    process.exit(1); // Exit process with failure
  }
}

// Initialize database connection
connectDB();

// Register models
require("./employee.model");
require("./games.model");

// Export the mongoose connection for use in other files
module.exports = mongoose.connection;