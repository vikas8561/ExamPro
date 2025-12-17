const mongoose = require("mongoose");

const DSAQuestionSchema = new mongoose.Schema(
  {
    questionNumber: {
      type: Number,
      unique: true,
      sparse: true, // Allow null values but enforce uniqueness when present
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      required: true,
      trim: true,
    },
    videoLink: {
      type: String,
      default: "",
      trim: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Auto-increment questionNumber
DSAQuestionSchema.pre("save", async function (next) {
  // Only set questionNumber if it's not already set (for new documents)
  if (this.isNew && !this.questionNumber) {
    try {
      const DSAQuestion = mongoose.model("DSAQuestion");
      const lastQuestion = await DSAQuestion.findOne()
        .sort({ questionNumber: -1 })
        .lean();
      this.questionNumber = lastQuestion && lastQuestion.questionNumber 
        ? lastQuestion.questionNumber + 1 
        : 1;
    } catch (error) {
      return next(error);
    }
  }
  // Ensure questionNumber is always set
  if (!this.questionNumber) {
    this.questionNumber = 1;
  }
  next();
});

// Indexes for efficient queries
DSAQuestionSchema.index({ questionNumber: 1 });
DSAQuestionSchema.index({ createdAt: -1 });
DSAQuestionSchema.index({ topic: 1 });

module.exports = mongoose.model("DSAQuestion", DSAQuestionSchema);
