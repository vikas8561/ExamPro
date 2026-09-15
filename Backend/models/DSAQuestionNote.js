const mongoose = require("mongoose");

const DSAQuestionNoteSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DSAQuestion",
      required: true,
    },
    // Student in the university's database - hydrate via services/principals.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
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
