const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
  testId: { type: String, required: true },
  userId: { type: String, required: true },
  type: { type: String, required: true }, // Example: "Test Review"
  status: { type: String, default: "Pending" } // Pending, Approved, Rejected
});

module.exports = mongoose.model("Review", ReviewSchema);
