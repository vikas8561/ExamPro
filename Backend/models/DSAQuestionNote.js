const mongoose = require("mongoose");

const DSAQuestionNoteSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DSAQuestion",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Not Started", "In Progress", "Completed"],
      default: "Not Started",
    },
  },
  { timestamps: true }
);

// Ensure one note per user per question
DSAQuestionNoteSchema.index({ questionId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("DSAQuestionNote", DSAQuestionNoteSchema);
