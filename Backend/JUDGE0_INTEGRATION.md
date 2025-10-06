# Judge0 Integration Documentation

## Overview

This document describes the complete Judge0 integration with the ExamPro code editor system. Judge0 provides secure code execution capabilities for multiple programming languages.

## Architecture

```
Frontend (React) → Backend (Node.js) → Judge0 API (Sinatra) → Judge0 Worker (Python)
```

## Components

### 1. Frontend Code Editor (`Judge0CodeEditor.jsx`)
- **Monaco Editor**: Provides syntax highlighting and code editing
- **Language Support**: Python, JavaScript, C++, C, Java, Go, C#, TypeScript
- **Features**: 
  - Run code against visible test cases
  - Submit code against hidden test cases
  - Real-time error display
  - Multiple language support

### 2. Backend Service (`services/judge0.js`)
- **API Integration**: Connects to deployed Judge0 API
- **Submission Management**: Handles code submission and result polling
- **Test Case Execution**: Runs code against multiple test cases in parallel
- **Error Handling**: Graceful timeout and error management

### 3. Judge0 API (Deployed on Render)
- **URL**: `https://judge0-api-b0cf.onrender.com`
- **Technology**: Sinatra-based Ruby API
- **Database**: PostgreSQL for submission storage
- **Queue**: Redis for job management

### 4. Judge0 Worker (Deployed on Render)
- **Technology**: Python Flask worker
- **Function**: Processes code execution requests
- **Sandboxing**: Uses isolate for secure code execution

## API Endpoints

### Judge0 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/v1/languages` | GET | Get supported languages |
| `/api/v1/submissions` | POST | Create code submission |
| `/api/v1/submissions/{id}` | GET | Get submission result |
| `/api/v1/submissions` | GET | List all submissions |

### Backend Integration Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/coding/run` | POST | Run code against visible test cases |
| `/coding/submit` | POST | Submit code against hidden test cases |

## Language Mapping

| Language | Judge0 ID | Frontend Key |
|----------|-----------|--------------|
| C | 50 | c |
| C++ | 54 | cpp |
| C# | 51 | csharp |
| Go | 60 | go |
| Java | 62 | java |
| JavaScript | 63 | javascript |
| Python | 71 | python |
| TypeScript | 74 | typescript |

## Workflow

### 1. Test Creation
1. Mentor creates coding test with visible and hidden test cases
2. Test is stored in database with question structure
3. Test can be assigned to students

### 2. Student Takes Test
1. Student opens test in code editor
2. Student writes code in supported language
3. Student can "Run" code against visible test cases
4. Student can "Submit" code against hidden test cases
5. Results are displayed with pass/fail status

### 3. Code Execution Flow
1. Frontend sends code to backend `/coding/run` or `/coding/submit`
2. Backend calls Judge0 API to create submission
3. Backend polls for results (with timeout)
4. Results are returned to frontend
5. Frontend displays execution results

## Configuration

### Environment Variables

#### Backend
```bash
JUDGE0_BASE_URL=https://judge0-api-b0cf.onrender.com  # Optional: defaults to deployed instance
# No API key needed - uses free deployed Judge0 instance
```

#### Judge0 API
```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=2358
SECRET_KEY_BASE=...
```

#### Judge0 Worker
```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=2358
```

## Error Handling

### Timeout Handling
- Code execution timeout: 60 seconds
- Graceful fallback with timeout status
- User-friendly error messages

### Status Codes
- `Accepted`: Code executed successfully
- `Wrong Answer`: Output doesn't match expected
- `Time Limit Exceeded`: Execution took too long
- `Compilation Error`: Code failed to compile
- `Runtime Error`: Code crashed during execution
- `Internal Error`: System error

## Testing

### Integration Test Results
✅ API Health Check: PASSED  
✅ Language Support: PASSED  
✅ Code Editor Integration: PASSED  
✅ Run Code (Visible Tests): PASSED  
✅ Submit Code (Hidden Tests): PASSED  
✅ Error Handling: PASSED  
✅ Multi-language Support: PASSED  

### Test Coverage
- Health check endpoint
- Language support verification
- Code execution with multiple languages
- Error handling scenarios
- Timeout management
- Test case execution

## Deployment Status

- ✅ **Judge0 API**: Deployed and running
- ✅ **Backend Integration**: Complete
- ✅ **Frontend Integration**: Complete
- ⚠️ **Worker Service**: Needs deployment for real-time execution

## Usage Examples

### Frontend Integration
```jsx
<Judge0CodeEditor
  testId={test._id}
  questionId={question._id}
  assignmentId={assignmentId}
  initialLanguage="python"
  initialCode={code}
  onRun={(results) => console.log('Run results:', results)}
  onSubmit={(results) => console.log('Submit results:', results)}
/>
```

### Backend Service Usage
```javascript
const { runAgainstCases } = require('./services/judge0');

const results = await runAgainstCases({
  sourceCode: 'print("Hello, World!")',
  language: 'python',
  cases: [
    { input: '', output: 'Hello, World!' }
  ]
});
```

## Troubleshooting

### Common Issues

1. **Invalid API Key Error (401)**
   - Symptoms: "Invalid API key" error when running code
   - Solution: ✅ FIXED - Removed RapidAPI dependencies, now uses free deployed Judge0 instance

2. **Worker Service Not Running**
   - Symptoms: All submissions timeout
   - Solution: Deploy and start the Judge0 worker service

3. **API Connection Issues**
   - Symptoms: Network errors
   - Solution: Check JUDGE0_BASE_URL configuration

4. **Language Not Supported**
   - Symptoms: Invalid language ID errors
   - Solution: Check language mapping in `mapLanguageToJudge0Id`

### Debug Commands

```bash
# Test API health
curl https://judge0-api-b0cf.onrender.com/

# Test language support
curl https://judge0-api-b0cf.onrender.com/api/v1/languages

# Test code submission
curl -X POST https://judge0-api-b0cf.onrender.com/api/v1/submissions \
  -H "Content-Type: application/json" \
  -d '{"source_code": "print(\"Hello\")", "language_id": 71, "stdin": ""}'
```

## Future Enhancements

- [ ] Real-time code execution with WebSocket
- [ ] Code execution history
- [ ] Performance metrics
- [ ] Additional language support
- [ ] Code analysis and suggestions
- [ ] Collaborative coding features

## Support

For issues or questions regarding the Judge0 integration:
1. Check the troubleshooting section
2. Review the API documentation
3. Test with the provided debug commands
4. Check deployment status of all services
