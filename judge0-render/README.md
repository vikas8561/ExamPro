# Judge0 Deployment on Render

This repository contains a complete Judge0 setup optimized for deployment on Render.com. Judge0 is a robust and scalable code execution system that supports 60+ programming languages.

## Architecture

The deployment consists of:
- **Judge0 API**: Sinatra-based API server
- **Judge0 Worker**: Python Flask worker for code execution
- **PostgreSQL Database**: For storing submissions and results
- **Key-Value Store**: For job queue management (Redis-compatible)

## Features

- ✅ Support for 60+ programming languages
- ✅ Secure code execution using isolate
- ✅ RESTful API
- ✅ Real-time job processing
- ✅ Scalable architecture
- ✅ Production-ready configuration

## Deployment Instructions

### Prerequisites

1. A Render.com account
2. A GitHub repository with this code

### Step 1: Deploy the Database

1. Go to your Render dashboard
2. Click "New +" → "PostgreSQL"
3. Name it `judge0-db`
4. Choose the "Starter" plan
5. Click "Create Database"
6. Note down the connection string

### Step 2: Deploy Key-Value Store (Redis Alternative)

1. Click "New +" → "Key Value"
2. Name it `judge0-redis`
3. Choose the "Starter" plan
4. Click "Create Key Value Store"
5. Note down the connection string

### Step 3: Deploy the API

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure the service:
   - **Name**: `judge0-api`
   - **Root Directory**: `judge0-render/api`
   - **Environment**: Docker
   - **Plan**: Starter
   - **Region**: Oregon (or your preferred region)

4. Add environment variables:
   - `RAILS_ENV`: `production`
   - `RACK_ENV`: `production`
   - `DATABASE_URL`: (from your PostgreSQL database)
   - `REDIS_URL`: (from your Key-Value store)
   - `PORT`: `2358`

5. Click "Create Web Service"

### Step 4: Deploy the Worker

1. Click "New +" → "Background Worker"
2. Connect your GitHub repository
3. Configure the service:
   - **Name**: `judge0-worker`
   - **Root Directory**: `judge0-render/worker`
   - **Environment**: Docker
   - **Plan**: Starter
   - **Region**: Oregon (or your preferred region)

4. Add environment variables:
   - `DATABASE_URL`: (from your PostgreSQL database)
   - `REDIS_URL`: (from your Key-Value store)
   - `PORT`: `2358`

5. Click "Create Background Worker"

### Step 5: Database Initialization

The database tables are automatically created when the API starts. You should see "Database initialized successfully" in the logs. No manual database setup is required.

## API Usage

### Base URL
Your API will be available at: `https://your-api-name.onrender.com`

### Endpoints

#### Health Check
```bash
GET /
```

#### Get Supported Languages
```bash
GET /api/v1/languages
```

#### Submit Code
```bash
POST /api/v1/submissions
Content-Type: application/json

{
  "submission": {
    "source_code": "print('Hello, World!')",
    "language_id": 71,
    "stdin": "",
    "expected_output": "Hello, World!"
  }
}
```

#### Get Submission Result
```bash
GET /api/v1/submissions/{id}
```

### Supported Languages

| ID | Language |
|----|----------|
| 50 | C (GCC 9.2.0) |
| 54 | C++ (GCC 9.2.0) |
| 51 | C# (Mono 6.6.0.161) |
| 60 | Go (1.13.5) |
| 62 | Java (OpenJDK 13.0.1) |
| 63 | JavaScript (Node.js 12.14.0) |
| 71 | Python (3.8.1) |
| 74 | TypeScript (3.7.4) |

## Integration with Your Code Editor

To integrate Judge0 with your code editor, use the API endpoints:

```javascript
// Submit code for execution
const submitCode = async (sourceCode, languageId) => {
  const response = await fetch('https://your-api-name.onrender.com/api/v1/submissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      submission: {
        source_code: sourceCode,
        language_id: languageId,
        stdin: '',
        expected_output: ''
      }
    })
  });
  
  return await response.json();
};

// Get submission result
const getResult = async (submissionId) => {
  const response = await fetch(`https://your-api-name.onrender.com/api/v1/submissions/${submissionId}`);
  return await response.json();
};
```

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Ensure DATABASE_URL is correctly set
   - Check if the database is accessible

2. **Key-Value Store Connection Issues**
   - Ensure REDIS_URL is correctly set
   - Verify Key-Value store is running

3. **Code Execution Issues**
   - Check if isolate is properly installed
   - Verify /box directory permissions

4. **Build Failures**
   - Check Docker logs for build errors
   - Ensure all dependencies are properly specified

### Logs

To view logs:
1. Go to your service dashboard
2. Click on "Logs" tab
3. Check for any error messages

### Performance

- The "Starter" plan is suitable for development and small-scale usage
- For production use, consider upgrading to higher plans
- Monitor resource usage in the Render dashboard

## Security Notes

- Judge0 uses isolate for secure code execution
- All code runs in sandboxed environments
- Network access is restricted by default
- File system access is limited to /box directory

## Support

For issues with this deployment:
1. Check the Render service logs
2. Verify all environment variables are set
3. Ensure database and Redis connections are working
4. Check the Judge0 documentation for API usage

## License

This deployment configuration is provided as-is. Judge0 itself is licensed under the MIT License.
