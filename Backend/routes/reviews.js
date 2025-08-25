const express = require("express");
const router = express.Router();
const Review = require("../models/Review");

// Get all reviews
router.get("/", async (req, res) => {
  try {
    const reviews = await Review.find();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create review
router.post("/", async (req, res) => {
  try {
    const { testId, userId, type, status } = req.body;
    const newReview = new Review({ testId, userId, type, status });
    await newReview.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update review
router.put("/:id", async (req, res) => {
  try {
    const updated = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete review
router.delete("/:id", async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: "Review deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
