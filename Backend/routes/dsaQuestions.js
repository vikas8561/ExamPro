const express = require("express");
const router = express.Router();
const DSAQuestion = require("../models/DSAQuestion");
const DSAQuestionNote = require("../models/DSAQuestionNote");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Get all DSA questions (for students - shows all questions)
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const questions = await DSAQuestion.find()
      .select("questionNumber name link videoLink topic createdAt")
      .sort({ questionNumber: 1 })
      .lean();

    // Get user's notes for all questions
    const userId = req.user.userId;
    const notes = await DSAQuestionNote.find({ userId })
      .select("questionId notes")
      .lean();

    // Create a map of questionId -> notes for quick lookup
    const notesMap = {};
    notes.forEach((note) => {
      notesMap[note.questionId.toString()] = note.notes;
    });

    // Create a map of questionId -> status for quick lookup
    const statusMap = {};
    notes.forEach((note) => {
      statusMap[note.questionId.toString()] = note.status || "Not Started";
    });

    // Add notes and status to each question
    const questionsWithNotes = questions.map((question) => ({
      ...question,
      notes: notesMap[question._id.toString()] || "",
      status: statusMap[question._id.toString()] || "Not Started",
    }));

    res.json({ questions: questionsWithNotes });
  } catch (error) {
    next(error);
  }
});

// Get single DSA question (for students)
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const question = await DSAQuestion.findById(req.params.id).lean();

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Get user's notes for this question
    const userId = req.user.userId;
    const note = await DSAQuestionNote.findOne({
      questionId: req.params.id,
      userId,
    }).lean();

    res.json({
      ...question,
      notes: note ? note.notes : "",
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get all DSA questions (for admin panel)
router.get("/admin/all", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const questions = await DSAQuestion.find()
      .select("questionNumber name link videoLink topic createdAt createdBy")
      .populate("createdBy", "name email")
      .sort({ questionNumber: 1 })
      .lean();

    res.json({ questions });
  } catch (error) {
    next(error);
  }
});

// Admin: Create new DSA question
router.post("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { name, link, videoLink, topic } = req.body;
    const userId = req.user.userId;

    if (!name || !link || !topic) {
      return res.status(400).json({ message: "Name, link, and topic are required" });
    }

    const question = new DSAQuestion({
      name,
      link,
      videoLink: videoLink || "",
      topic,
      createdBy: userId,
    });

    await question.save();

    res.status(201).json({
      message: "DSA question created successfully",
      question,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Duplicate question number" });
    }
    next(error);
  }
});

// Admin: Update DSA question
router.put("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { name, link, videoLink, topic } = req.body;

    const question = await DSAQuestion.findById(req.params.id);

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    if (name) question.name = name;
    if (link) question.link = link;
    if (videoLink !== undefined) question.videoLink = videoLink;
    if (topic) question.topic = topic;

    await question.save();

    res.json({
      message: "Question updated successfully",
      question,
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Delete DSA question
router.delete("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const question = await DSAQuestion.findById(req.params.id);

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Delete all notes associated with this question
    await DSAQuestionNote.deleteMany({ questionId: req.params.id });

    await DSAQuestion.findByIdAndDelete(req.params.id);

    res.json({ message: "Question deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Student: Save notes for a question
router.post("/:id/notes", authenticateToken, async (req, res, next) => {
  try {
    const { notes, status } = req.body;
    const userId = req.user.userId;
    const questionId = req.params.id;

    // Verify question exists
    const question = await DSAQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Update or create notes and status
    const updateData = { notes: notes || "" };
    if (status) {
      updateData.status = status;
    }

    const note = await DSAQuestionNote.findOneAndUpdate(
      { questionId, userId },
      updateData,
      { upsert: true, new: true }
    );

    res.json({
      message: "Notes saved successfully",
      note,
    });
  } catch (error) {
    next(error);
  }
});

// Student: Update status for a question
router.post("/:id/status", authenticateToken, async (req, res, next) => {
  try {
    const { status } = req.body;
    const userId = req.user.userId;
    const questionId = req.params.id;

    if (!status || !["Not Started", "In Progress", "Completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Verify question exists
    const question = await DSAQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Update or create status (create note entry if doesn't exist)
    const note = await DSAQuestionNote.findOneAndUpdate(
      { questionId, userId },
      { status },
      { upsert: true, new: true }
    );

    res.json({
      message: "Status updated successfully",
      note,
    });
  } catch (error) {
    next(error);
  }
});

// Student: Get notes for a question
router.get("/:id/notes", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const questionId = req.params.id;

    const note = await DSAQuestionNote.findOne({
      questionId,
      userId,
    }).lean();

    res.json({
      notes: note ? note.notes : "",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
