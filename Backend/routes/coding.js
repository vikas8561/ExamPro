const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Test = require('../models/Test');
const Assignment = require('../models/Assignment');
const TestSubmission = require('../models/TestSubmission');
const { runAgainstCases } = require('../services/judge0');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'coding routes',
    timestamp: new Date().toISOString(),
    routes: ['/health', '/test', '/run', '/submit']
  });
});

// Test endpoint without authentication
router.post('/test', async (req, res, next) => {
  try {
    const { sourceCode, language } = req.body;
    console.log('Test request:', { language, sourceCodeLength: sourceCode?.length });

    if (!sourceCode) {
      return res.status(400).json({ message: 'sourceCode is required' });
    }

    // Simple test case
    const testCases = [{ input: '3', output: 'Prime' }];
    const results = await runAgainstCases({ sourceCode, language: language || 'python', cases: testCases });
    const passed = results.filter(r => r.passed).length;
    console.log('Test results:', { passed, total: results.length });

    res.json({ results, passed, total: results.length });
  } catch (err) {
    console.error('Error in /coding/test:', err.message, err.stack);
    res.status(500).json({ message: 'Code execution failed. Please try again later.' });
  }
});

// Run code against visible test cases (student preview)
// Temporarily remove auth for debugging
router.post('/run', async (req, res, next) => {
  try {
    console.log('=== /coding/run endpoint called ===');
    console.log('🔐 Authenticated user:', req.user);
    console.log('📝 Request headers:', req.headers);
    const { testId, questionId, sourceCode, language } = req.body;
    console.log('Run request:', { testId, questionId, language, sourceCodeLength: sourceCode?.length });

    if (!testId || !questionId || !sourceCode) {
      return res.status(400).json({ message: 'testId, questionId and sourceCode are required' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      console.log('Test not found:', testId);
      return res.status(404).json({ message: 'Test not found' });
    }

    const question = test.questions.id(questionId);
    if (!question || question.kind !== 'coding') {
      console.log('Coding question not found:', questionId, question?.kind);
      return res.status(400).json({ message: 'Coding question not found' });
    }

    const visibleCases = (question.visibleTestCases || []).map(c => ({ input: c.input, output: c.output }));
    console.log('Visible cases count:', visibleCases.length);

    if (visibleCases.length === 0) {
      return res.json({ results: [], passed: 0, total: 0 });
    }

    const results = await runAgainstCases({ sourceCode, language, cases: visibleCases });
    const passed = results.filter(r => r.passed).length;
    console.log('Run results:', { passed, total: results.length });

    res.json({ results, passed, total: results.length });
  } catch (err) {
    console.error('=== ERROR in /coding/run ===');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Request body:', req.body);
    console.error('Request headers:', req.headers);
    // Return a more user-friendly error instead of 500
    res.status(500).json({ 
      message: 'Code execution failed. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Submit code against hidden test cases (final grading for one question)
router.post('/submit', authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId, questionId, sourceCode, language } = req.body;
    if (!questionId || !sourceCode) {
      return res.status(400).json({ message: 'questionId and sourceCode are required' });
    }

    let test;
    let question;
    if (assignmentId) {
      const assignment = await Assignment.findById(assignmentId).populate('testId');
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
      test = assignment.testId;
      question = test.questions.id(questionId);
    } else {
      // Fallback: locate test containing the question (slower, but supports practice/non-assigned flow)
      test = await Test.findOne({ 'questions._id': questionId });
      if (test) {
        question = test.questions.id(questionId);
      }
    }

    if (!question || question.kind !== 'coding') {
      return res.status(400).json({ message: 'Coding question not found' });
    }

    const hiddenCases = (question.hiddenTestCases || []).map(c => ({ input: c.input, output: c.output, marks: c.marks }));
    const results = await runAgainstCases({ sourceCode, language, cases: hiddenCases });
    const passedCount = results.filter(r => r.passed).length;
    const totalMarks = hiddenCases.reduce((s, c) => s + (c.marks || 0), 0);
    const earnedMarks = results.reduce((s, r) => s + (r.passed ? (r.marks || 0) : 0), 0);

    // Build partial response for optional persistence
    const response = {
      questionId,
      selectedOption: null,
      textAnswer: null,
      isCorrect: false,
      points: earnedMarks,
      autoGraded: true,
      geminiFeedback: null,
      correctAnswer: null,
      errorAnalysis: null,
      improvementSteps: [],
      topicRecommendations: []
    };

    // If assignment provided, persist. Otherwise, just return results.
    if (assignmentId) {
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
      let submission = await TestSubmission.findOne({ assignmentId, userId: assignment.userId });
      if (!submission) {
        submission = await TestSubmission.create({
          assignmentId,
          testId: test._id,
          userId: assignment.userId,
          responses: [response],
          totalScore: earnedMarks,
          maxScore: totalMarks,
          submittedAt: null,
          timeSpent: 0,
          mentorReviewed: false,
          reviewStatus: 'Pending'
        });
      } else {
        const idx = submission.responses.findIndex(r => r.questionId.toString() === String(questionId));
        if (idx >= 0) submission.responses[idx] = response; else submission.responses.push(response);
        // Recompute maxScore as sum of question points if available
        submission.totalScore = (submission.responses || []).reduce((sum, r) => sum + (r.points || 0), 0);
        await submission.save();
      }
    }

    res.json({ results, passedCount, totalHidden: hiddenCases.length, earnedMarks, totalMarks });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


