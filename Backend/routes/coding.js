const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Test = require('../models/Test');
const Assignment = require('../models/Assignment');
const TestSubmission = require('../models/TestSubmission');
const { runAgainstCases } = require('../services/judge0');

// Health check endpoint (authenticated only)
router.get('/health', authenticateToken, (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'coding routes',
    timestamp: new Date().toISOString(),
    routes: ['/health', '/test', '/run', '/submit']
  });
});

// Test endpoint (authenticated only)
router.post('/test', authenticateToken, async (req, res, next) => {
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
router.post('/run', authenticateToken, async (req, res, next) => {
  try {
    console.log('=== /coding/run endpoint called ===');
    console.log('🔐 Authenticated user:', req.user);
    console.log('📝 Request headers:', req.headers);
    const { assignmentId, questionId, sourceCode, language } = req.body;
    console.log('Run request:', { assignmentId, questionId, language, sourceCodeLength: sourceCode?.length });

    // Enhanced validation
    if (!assignmentId || !questionId || !sourceCode) {
      console.log('❌ Missing required fields:', { assignmentId: !!assignmentId, questionId: !!questionId, sourceCode: !!sourceCode });
      return res.status(400).json({ message: 'assignmentId, questionId and sourceCode are required' });
    }

    // Validate ObjectId format
    if (!assignmentId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('❌ Invalid assignmentId format:', assignmentId);
      return res.status(400).json({ message: 'Invalid assignmentId format' });
    }

    if (!questionId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('❌ Invalid questionId format:', questionId);
      return res.status(400).json({ message: 'Invalid questionId format' });
    }

    console.log('🔍 Fetching assignment from database...');
    const assignment = await Assignment.findById(assignmentId).populate('testId');
    if (!assignment) {
      console.log('❌ Assignment not found:', assignmentId);
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if assignment belongs to the authenticated user
    if (assignment.userId.toString() !== req.user.userId) {
      console.log('❌ Assignment does not belong to user:', { assignmentUserId: assignment.userId, requestUserId: req.user.userId });
      return res.status(403).json({ message: 'Access denied. Assignment does not belong to you.' });
    }

    console.log('✅ Assignment found:', assignment.testId.title);

    console.log('🔍 Looking for question in test...');
    const question = assignment.testId.questions.id(questionId);
    if (!question) {
      console.log('❌ Question not found in test:', questionId);
      console.log('Available question IDs:', assignment.testId.questions.map(q => q._id));
      return res.status(404).json({ message: 'Question not found in test' });
    }

    if (question.kind !== 'coding') {
      console.log('❌ Question is not a coding question:', question.kind);
      return res.status(400).json({ message: 'Question is not a coding question' });
    }
    console.log('✅ Coding question found:', question.text.substring(0, 50) + '...');

    // Use student's selected language, fallback to question's language
    const questionLanguage = language || question.language;
    console.log('🔤 Using language:', questionLanguage, '(student selected:', language, ', question default:', question.language, ')');
    
    if (!questionLanguage) {
      console.log('❌ No language specified by student or question');
      return res.status(400).json({ message: 'Language must be specified' });
    }

    const visibleCases = (question.visibleTestCases || []).map(c => ({ input: c.input, output: c.output }));
    console.log('📋 Visible test cases:', visibleCases.length);
    console.log('📋 Test cases data:', visibleCases);

    if (visibleCases.length === 0) {
      console.log('⚠️ No visible test cases found');
      return res.json({ results: [], passed: 0, total: 0, message: 'No visible test cases available' });
    }

    console.log('🚀 Running code against test cases...');
    const results = await runAgainstCases({ sourceCode, language: questionLanguage, cases: visibleCases });
    const passed = results.filter(r => r.passed).length;
    console.log('✅ Run results:', { passed, total: results.length });
    console.log('📊 Detailed results:', results);

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
    console.log('=== /coding/submit endpoint called ===');
    console.log('🔐 Authenticated user:', req.user);
    console.log('📝 Request headers:', req.headers);
    const { assignmentId, questionId, sourceCode, language } = req.body;
    console.log('Submit request:', { assignmentId, questionId, language, sourceCodeLength: sourceCode?.length });

    // Enhanced validation
    if (!questionId || !sourceCode) {
      console.log('❌ Missing required fields:', { questionId: !!questionId, sourceCode: !!sourceCode });
      return res.status(400).json({ message: 'questionId and sourceCode are required' });
    }

    // Validate ObjectId format for questionId
    if (!questionId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('❌ Invalid questionId format:', questionId);
      return res.status(400).json({ message: 'Invalid questionId format' });
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

    // Use student's selected language, fallback to question's language
    const questionLanguage = language || question.language;
    console.log('🔤 Submit - Using language:', questionLanguage, '(student selected:', language, ', question default:', question.language, ')');
    
    if (!questionLanguage) {
      console.log('❌ No language specified by student or question');
      return res.status(400).json({ message: 'Language must be specified' });
    }

    const hiddenCases = (question.hiddenTestCases || []).map(c => ({ input: c.input, output: c.output, marks: c.marks }));
    const results = await runAgainstCases({ sourceCode, language: questionLanguage, cases: hiddenCases });
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


