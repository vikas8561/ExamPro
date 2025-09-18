const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const User = require("../models/User");
const Test = require("../models/Test");
const TestSubmission = require("../models/TestSubmission");
const { authenticateToken } = require("../middleware/auth");
const { cacheMiddleware, invalidateCache } = require("../middleware/cache");

// Get mentor dashboard data with caching
router.get("/dashboard", authenticateToken, cacheMiddleware(300), async (req, res) => {
  try {
    const mentorId = req.user.userId;
    // console.log('Fetching dashboard for mentor:', mentorId);
    
    // Optimized query with selective population
    const assignments = await Assignment.find({ mentorId })
      .populate("testId", "title type instructions timeLimit")
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance

    const activeAssignments = assignments.filter(a => a.status === "In Progress");
    const completedAssignments = assignments.filter(a => a.status === "Completed");
    
    // Optimized submissions query with limit and lean
    const submissions = await TestSubmission.find()
      .populate({
        path: "assignmentId",
        populate: {
          path: "testId",
          select: "title"
        }
      })
      .populate("userId", "name email")
      .sort({ submittedAt: -1 })
      .limit(10)
      .lean();

    res.json({
      totalAssigned: assignments.length,
      activeTests: activeAssignments.length,
      completedTests: completedAssignments.length,
      recentSubmissions: submissions,
      assignments
    });
  } catch (err) {
    console.error('Error in mentor dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get assignments with optimized queries and caching
router.get("/assignments", authenticateToken, cacheMiddleware(180), async (req, res) => {
  try {
    const mentorId = req.user.userId;
    // console.log('Fetching assignments for mentor:', mentorId);
    
    // Use aggregation pipeline for better performance
    const assignments = await Assignment.aggregate([
      {
        $match: {
          $or: [
            { mentorId: new mongoose.Types.ObjectId(mentorId) },
            { mentorId: null }
          ]
        }
      },
      {
        $lookup: {
          from: 'tests',
          localField: 'testId',
          foreignField: '_id',
          as: 'testId',
          pipeline: [
            {
              $project: {
                title: 1,
                type: 1,
                instructions: 1,
                timeLimit: 1,
                questions: {
                  $slice: ['$questions', 5] // Limit questions for performance
                }
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userId',
          pipeline: [
            {
              $project: {
                name: 1,
                email: 1
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'testsubmissions',
          localField: '_id',
          foreignField: 'assignmentId',
          as: 'submission',
          pipeline: [
            {
              $project: {
                submittedAt: 1
              }
            }
          ]
        }
      },
      {
        $addFields: {
          testId: { $arrayElemAt: ['$testId', 0] },
          userId: { $arrayElemAt: ['$userId', 0] },
          submittedAt: { $arrayElemAt: ['$submission.submittedAt', 0] }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    // console.log('Found assignments:', assignments.length);
    res.json(assignments);
    
  } catch (err) {
    console.error('Critical error in mentor assignments:', err);
    res.status(500).json({ 
      error: 'Failed to fetch assignments',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Get submissions with pagination and caching
router.get("/submissions", authenticateToken, cacheMiddleware(120), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Cap at 100
    const skip = (page - 1) * limit;

    // Use aggregation for better performance
    const pipeline = [
      {
        $lookup: {
          from: 'assignments',
          localField: 'assignmentId',
          foreignField: '_id',
          as: 'assignmentId',
          pipeline: [
            {
              $lookup: {
                from: 'tests',
                localField: 'testId',
                foreignField: '_id',
                as: 'testId',
                pipeline: [
                  {
                    $project: {
                      title: 1,
                      questions: {
                        $slice: ['$questions', 3] // Limit questions
                      }
                    }
                  }
                ]
              }
            },
            {
              $addFields: {
                testId: { $arrayElemAt: ['$testId', 0] }
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userId',
          pipeline: [
            {
              $project: {
                name: 1,
                email: 1
              }
            }
          ]
        }
      },
      {
        $addFields: {
          assignmentId: { $arrayElemAt: ['$assignmentId', 0] },
          userId: { $arrayElemAt: ['$userId', 0] }
        }
      },
      {
        $sort: { submittedAt: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      }
    ];

    const submissions = await TestSubmission.aggregate(pipeline);

    // Group submissions by student
    const studentsMap = new Map();
    
    submissions.forEach(submission => {
      const studentId = submission.userId?._id?.toString();
      if (!studentId) return;
      
      if (!studentsMap.has(studentId)) {
        studentsMap.set(studentId, {
          student: {
            _id: submission.userId._id,
            name: submission.userId.name,
            email: submission.userId.email
          },
          submissions: [],
          totalSubmissions: 0,
          averageScore: 0,
          totalScore: 0
        });
      }
      
      const studentData = studentsMap.get(studentId);
      studentData.submissions.push(submission);
      studentData.totalSubmissions++;
      studentData.totalScore += submission.totalScore || 0;
    });
    
    // Calculate average scores
    const groupedStudents = Array.from(studentsMap.values()).map(studentData => ({
      ...studentData,
      averageScore: studentData.totalSubmissions > 0 
        ? Math.round(studentData.totalScore / studentData.totalSubmissions) 
        : 0
    }));

    // Get total count for pagination
    const totalCount = await TestSubmission.countDocuments();
    
    res.json({
      students: groupedStudents,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('Error in mentor submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cache invalidation endpoint
router.post("/invalidate-cache", authenticateToken, (req, res) => {
  try {
    const { pattern } = req.body;
    if (pattern) {
      invalidateCache(pattern);
      res.json({ message: `Cache invalidated for pattern: ${pattern}` });
    } else {
      res.status(400).json({ error: 'Pattern is required' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
