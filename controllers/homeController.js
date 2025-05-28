const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Employee = mongoose.model("Employee");
const games = mongoose.model("games");

// GET route for the home page
router.get("/", async (req, res) => {
  try {
    const docs = await games.find({ meetingid: "123123123123123" }).lean();
    res.render("home/appHome", {
      listt: docs,
    });
  } catch (err) {
    console.error("Error retrieving employee list: " + err);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
