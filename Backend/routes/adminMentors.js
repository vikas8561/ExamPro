const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Mentor = require("../models/Mentor");
const Subject = require("../models/Subject");
const Test = require("../models/Test");
const { BATCHES, cohortCounts } = require("../services/principals");
const { authenticateToken, requireRole } = require("../middleware/auth");

/**
 * GET /api/admin/mentors
 * Returns all mentors with their populated subjects, assigned batches, and created tests count.
 * Accessible only by Admin.
 */
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const mentors = await Mentor.find({})
      .select("name email subjects batches createdAt")
      .populate("subjects", "name description")
      .sort({ name: 1 })
      .lean();

    // Batch count tests created by each mentor
    const mentorIds = mentors.map((m) => m._id);
    const testCounts = await Test.aggregate([
      { $match: { createdBy: { $in: mentorIds } } },
      { $group: { _id: "$createdBy", count: { $sum: 1 } } }
    ]);

    const countMap = new Map(testCounts.map((tc) => [String(tc._id), tc.count]));

    const result = mentors.map((m) => ({
      _id: m._id,
      name: m.name,
      email: m.email,
      subjects: m.subjects || [],
      batches: m.batches || [],
      testCount: countMap.get(String(m._id)) || 0,
      createdAt: m.createdAt
    }));

    res.json({ mentors: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/mentors/:mentorId/subjects
 * Updates all assigned subjects for a mentor.
 * Body: { subjectIds: ["...", "..."] }
 * Accessible only by Admin.
 */
router.put("/:mentorId/subjects", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId } = req.params;
    const { subjectIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({ message: "Invalid mentor ID" });
    }

    if (!Array.isArray(subjectIds)) {
      return res.status(400).json({ message: "subjectIds must be an array of IDs" });
    }

    const mentor = await Mentor.findById(mentorId);
    if (!mentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    // Validate that all subject IDs are valid ObjectIds
    const validSubjectIds = [];
    for (const id of subjectIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: `Invalid subject ID: ${id}` });
      }
      validSubjectIds.push(new mongoose.Types.ObjectId(id));
    }

    // Verify all subjects exist in the database
    if (validSubjectIds.length > 0) {
      const existingSubjects = await Subject.find({ _id: { $in: validSubjectIds } })
        .select("_id")
        .lean();
      if (existingSubjects.length !== validSubjectIds.length) {
        return res.status(400).json({ message: "One or more selected subjects do not exist" });
      }
    }

    // Update mentor's assigned subjects
    mentor.subjects = validSubjectIds;
    await mentor.save();

    const updatedMentor = await Mentor.findById(mentorId)
      .select("name email subjects")
      .populate("subjects", "name description")
      .lean();

    res.json({
      message: "Mentor subjects updated successfully",
      mentor: updatedMentor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/mentors/:mentorId/subjects/:subjectId
 * Removes a specific subject from a mentor.
 * Accessible only by Admin.
 */
router.delete("/:mentorId/subjects/:subjectId", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId, subjectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mentorId) || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: "Invalid mentor or subject ID" });
    }

    const updatedMentor = await Mentor.findByIdAndUpdate(
      mentorId,
      { $pull: { subjects: new mongoose.Types.ObjectId(subjectId) } },
      { new: true }
    )
      .select("name email subjects")
      .populate("subjects", "name description")
      .lean();

    if (!updatedMentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    res.json({
      message: "Subject removed successfully",
      mentor: updatedMentor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/mentors/:mentorId/subjects/:subjectId
 * Adds a specific subject to a mentor.
 * Accessible only by Admin.
 */
router.post("/:mentorId/subjects/:subjectId", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId, subjectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mentorId) || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: "Invalid mentor or subject ID" });
    }

    // Verify subject exists
    const subjectExists = await Subject.exists({ _id: subjectId });
    if (!subjectExists) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const updatedMentor = await Mentor.findByIdAndUpdate(
      mentorId,
      { $addToSet: { subjects: new mongoose.Types.ObjectId(subjectId) } },
      { new: true }
    )
      .select("name email subjects")
      .populate("subjects", "name description")
      .lean();

    if (!updatedMentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    res.json({
      message: "Subject assigned successfully",
      mentor: updatedMentor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/mentors/batches
 * Returns all available batches with their student counts.
 * Accessible only by Admin.
 */
router.get("/batches", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const counts = await cohortCounts();
    // Exclude 'all' since individual batches are assigned
    const batches = counts.filter((c) => c.key !== "all");
    res.json({ batches });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/mentors/:mentorId/batches
 * Updates all assigned batches for a mentor.
 * Body: { batches: ["ru", "su702", ...] }
 * Accessible only by Admin.
 */
router.put("/:mentorId/batches", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId } = req.params;
    const { batches } = req.body;

    if (!mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({ message: "Invalid mentor ID" });
    }

    if (!Array.isArray(batches)) {
      return res.status(400).json({ message: "batches must be an array of batch keys" });
    }

    const mentor = await Mentor.findById(mentorId);
    if (!mentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    // Validate that all batch keys exist in BATCHES
    const validBatchKeys = BATCHES.map((b) => b.key);
    const cleanedBatches = [];
    for (const key of batches) {
      const trimmed = String(key || "").trim().toLowerCase();
      if (!validBatchKeys.includes(trimmed)) {
        return res.status(400).json({
          message: `Invalid batch key: "${key}". Allowed keys: ${validBatchKeys.join(", ")}`
        });
      }
      if (!cleanedBatches.includes(trimmed)) {
        cleanedBatches.push(trimmed);
      }
    }

    mentor.batches = cleanedBatches;
    await mentor.save();

    const updatedMentor = await Mentor.findById(mentorId)
      .select("name email subjects batches")
      .populate("subjects", "name description")
      .lean();

    res.json({
      message: "Mentor batches updated successfully",
      mentor: updatedMentor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/mentors/:mentorId/batches/:batchKey
 * Removes a specific batch from a mentor.
 * Accessible only by Admin.
 */
router.delete("/:mentorId/batches/:batchKey", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId, batchKey } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({ message: "Invalid mentor ID" });
    }

    const cleanedKey = String(batchKey || "").trim().toLowerCase();

    const updatedMentor = await Mentor.findByIdAndUpdate(
      mentorId,
      { $pull: { batches: cleanedKey } },
      { new: true }
    )
      .select("name email subjects batches")
      .populate("subjects", "name description")
      .lean();

    if (!updatedMentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    res.json({
      message: "Batch removed successfully",
      mentor: updatedMentor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/mentors/:mentorId/batches/:batchKey
 * Adds a specific batch to a mentor.
 * Accessible only by Admin.
 */
router.post("/:mentorId/batches/:batchKey", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId, batchKey } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({ message: "Invalid mentor ID" });
    }

    const cleanedKey = String(batchKey || "").trim().toLowerCase();
    const validBatchKeys = BATCHES.map((b) => b.key);
    if (!validBatchKeys.includes(cleanedKey)) {
      return res.status(400).json({
        message: `Invalid batch key: "${batchKey}". Allowed keys: ${validBatchKeys.join(", ")}`
      });
    }

    const updatedMentor = await Mentor.findByIdAndUpdate(
      mentorId,
      { $addToSet: { batches: cleanedKey } },
      { new: true }
    )
      .select("name email subjects batches")
      .populate("subjects", "name description")
      .lean();

    if (!updatedMentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    res.json({
      message: "Batch assigned successfully",
      mentor: updatedMentor
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
