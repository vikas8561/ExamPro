const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Get all reviews (admin only)
router.get("/", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const reviews = await Review.find();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create review (admin only)
router.post("/", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const { testId, userId, type, status } = req.body;
    const newReview = new Review({ testId, userId, type, status });
    await newReview.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update review (admin only)
router.put("/:id", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const updated = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete review (admin only)
router.delete("/:id", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: "Review deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
