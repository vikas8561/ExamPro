// Feedback messages for different score categories
export const feedbackMessages = {
  excellent: [ // 90-100%
    "Outstanding performance! You've mastered this test with exceptional understanding. Keep up the excellent work!",
    "Exceptional work! Your deep understanding of the concepts is truly impressive. Outstanding achievement!",
    "Brilliant performance! You've demonstrated mastery of the subject matter. Congratulations on this excellent result!",
    "Outstanding achievement! Your comprehensive understanding and attention to detail are remarkable. Well done!",
    "Exceptional mastery! You've shown complete command of the material. This is truly impressive work!",
    "Outstanding results! Your thorough preparation and deep understanding have paid off brilliantly!",
    "Exceptional performance! You've demonstrated superior knowledge and analytical skills. Outstanding work!",
    "Brilliant achievement! Your mastery of the concepts is evident in every answer. Congratulations!",
    "Outstanding work! You've shown exceptional understanding and precision. This is exemplary performance!",
    "Exceptional mastery! Your comprehensive knowledge and attention to detail are truly commendable!",
    "Outstanding performance! You've demonstrated complete understanding of the subject. Excellent work!",
    "Brilliant results! Your thorough preparation and deep insights are truly impressive. Well done!",
    "Exceptional achievement! You've shown mastery of the material with outstanding precision. Congratulations!",
    "Outstanding work! Your comprehensive understanding and analytical skills are remarkable. Excellent job!",
    "Exceptional performance! You've demonstrated superior knowledge and attention to detail. Outstanding achievement!"
  ],
  veryGood: [ // 80-89%
    "Excellent work! You've demonstrated strong understanding of the material. Well done!",
    "Great job! Your solid grasp of the concepts is evident. Keep up the excellent work!",
    "Very good performance! You've shown strong understanding and good analytical skills. Well done!",
    "Excellent results! Your thorough preparation and understanding are commendable. Great work!",
    "Outstanding effort! You've demonstrated solid knowledge of the subject matter. Excellent job!",
    "Great performance! Your understanding of the concepts is strong and well-developed. Well done!",
    "Excellent work! You've shown good comprehension and analytical thinking. Keep it up!",
    "Very good results! Your solid preparation and understanding are evident. Great achievement!",
    "Excellent performance! You've demonstrated strong grasp of the material. Outstanding work!",
    "Great job! Your understanding of the concepts is solid and well-rounded. Excellent effort!",
    "Very good work! You've shown strong analytical skills and good comprehension. Well done!",
    "Excellent results! Your thorough understanding and preparation are commendable. Great job!",
    "Outstanding performance! You've demonstrated solid knowledge and good analytical skills. Excellent work!",
    "Great achievement! Your understanding of the material is strong and well-developed. Well done!",
    "Excellent work! You've shown solid comprehension and good analytical thinking. Outstanding effort!"
  ],
  good: [ // 70-79%
    "Great job! You've shown good comprehension. Continue practicing to reach even higher scores!",
    "Good performance! Your understanding of the concepts is developing well. Keep up the good work!",
    "Well done! You've demonstrated solid grasp of the material. Continue practicing for even better results!",
    "Good work! Your comprehension is on the right track. Keep studying to improve further!",
    "Great effort! You've shown good understanding of the subject. Continue practicing to excel!",
    "Good performance! Your knowledge of the concepts is solid. Keep working hard for better results!",
    "Well done! You've demonstrated good comprehension and analytical skills. Keep it up!",
    "Good job! Your understanding is developing well. Continue practicing to reach your full potential!",
    "Great work! You've shown solid grasp of the material. Keep studying for even better performance!",
    "Good results! Your comprehension is on track. Continue practicing to achieve excellence!",
    "Well done! You've demonstrated good understanding of the concepts. Keep up the effort!",
    "Good performance! Your knowledge is solid and developing. Continue working hard!",
    "Great job! You've shown good analytical skills. Keep practicing to reach higher levels!",
    "Good work! Your understanding is progressing well. Continue studying for better results!",
    "Well done! You've demonstrated solid comprehension. Keep up the good work and practice more!"
  ],
  satisfactory: [ // 60-69%
    "Good effort! You're on the right track. Review the material and practice more to improve.",
    "Decent performance! Your understanding is developing. Focus on weak areas and practice more.",
    "Good attempt! You've shown some understanding. Review the concepts and practice regularly.",
    "Satisfactory work! You're making progress. Study the material more thoroughly for better results.",
    "Good effort! Your comprehension is improving. Focus on understanding the fundamentals better.",
    "Decent results! You're on the right path. Review the topics and practice more consistently.",
    "Good work! Your understanding is developing. Study the material more deeply for improvement.",
    "Satisfactory performance! You're making good progress. Focus on areas that need more attention.",
    "Good attempt! Your knowledge is growing. Review the concepts and practice more regularly.",
    "Decent effort! You're improving. Study the material more thoroughly and practice consistently.",
    "Good results! Your understanding is developing. Focus on the fundamentals and practice more.",
    "Satisfactory work! You're on track. Review the topics and study more deeply for better performance.",
    "Good performance! Your comprehension is improving. Focus on weak areas and practice regularly.",
    "Decent work! You're making progress. Study the material more thoroughly and practice consistently.",
    "Good effort! Your understanding is developing. Review the concepts and practice more for improvement."
  ],
  needsImprovement: [ // 50-59%
    "Fair performance. Consider reviewing the topics and practicing more to enhance your understanding.",
    "Room for improvement. Focus on understanding the fundamentals better and practice regularly.",
    "Decent attempt. Review the material more thoroughly and practice the concepts you find difficult.",
    "Fair results. Study the topics more deeply and practice consistently to improve your performance.",
    "Needs more work. Focus on the basics and practice regularly to build stronger understanding.",
    "Fair performance. Review the material thoroughly and practice the concepts you're struggling with.",
    "Room for growth. Study the fundamentals more carefully and practice consistently for better results.",
    "Decent effort. Focus on understanding the core concepts better and practice more regularly.",
    "Fair work. Review the topics more deeply and practice the areas where you need improvement.",
    "Needs improvement. Study the material more thoroughly and practice consistently to enhance understanding.",
    "Fair results. Focus on the basics and practice regularly to build better comprehension.",
    "Room for development. Review the concepts more carefully and practice consistently for improvement.",
    "Decent performance. Study the fundamentals more deeply and practice the difficult topics regularly.",
    "Fair attempt. Focus on understanding the core concepts better and practice more consistently.",
    "Needs more practice. Review the material thoroughly and practice regularly to improve your performance."
  ],
  poor: [ // Below 50%
    "Keep trying! Don't give up. Review the material thoroughly and practice more. You can improve!",
    "Don't be discouraged! Focus on the basics and practice regularly. Improvement is definitely possible!",
    "Keep working hard! Review the fundamental concepts and practice consistently. You can do better!",
    "Stay motivated! Study the material more thoroughly and practice regularly. Progress takes time!",
    "Don't lose hope! Focus on understanding the basics first and practice step by step. You can improve!",
    "Keep practicing! Review the material carefully and practice the concepts you find difficult. You've got this!",
    "Stay positive! Focus on the fundamentals and practice regularly. Every expert was once a beginner!",
    "Keep going! Study the material more thoroughly and practice consistently. Improvement is within reach!",
    "Don't give up! Review the basic concepts and practice regularly. You can definitely improve!",
    "Stay determined! Focus on understanding the fundamentals and practice step by step. You can succeed!",
    "Keep working! Review the material carefully and practice the difficult topics regularly. Progress is possible!",
    "Stay motivated! Study the basics more thoroughly and practice consistently. You can achieve better results!",
    "Don't be discouraged! Focus on the core concepts and practice regularly. Every step forward counts!",
    "Keep trying! Review the material more carefully and practice consistently. You have the potential to improve!",
    "Stay positive! Focus on the fundamentals and practice regularly. Success comes with persistence and effort!"
  ]
};

// Function to get random feedback based on score and test ID
export const getRandomFeedback = (score, testId) => {
  // If score is 0, it means the student hasn't taken the exam yet
  if (score === 0) {
    return "Ready to begin? Complete the test to show your knowledge and get your results!";
  }
  
  // Generate consistent random feedback based on test ID and score
  const seed = (testId || 'default').toString().slice(-6) + score.toString();
  const randomIndex = parseInt(seed, 16) % 15; // 0-14 for 15 different messages
  
  if (score >= 90) return feedbackMessages.excellent[randomIndex];
  else if (score >= 80) return feedbackMessages.veryGood[randomIndex];
  else if (score >= 70) return feedbackMessages.good[randomIndex];
  else if (score >= 60) return feedbackMessages.satisfactory[randomIndex];
  else if (score >= 50) return feedbackMessages.needsImprovement[randomIndex];
  else return feedbackMessages.poor[randomIndex];
};
