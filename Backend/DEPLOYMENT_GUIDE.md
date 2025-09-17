# Deployment Guide for ExamPro Backend

## CORS Configuration Fixed

The CORS configuration has been updated to properly handle requests from your Vercel frontend at `https://cg-test-app.vercel.app`.

## Environment Variables Required

Make sure these environment variables are set in your Render deployment:

1. `MONGODB_URI` - Your MongoDB connection string
2. `FRONTEND_URL` - Set to `https://cg-test-app.vercel.app`
3. `PORT` - Render will set this automatically
4. `JWT_SECRET` - Your JWT secret key
5. Any other environment variables your app needs

## Testing CORS

After deployment, you can test the CORS configuration by visiting:
- `https://cg-test-app.onrender.com/health` - Health check endpoint
- `https://cg-test-app.onrender.com/cors-test` - CORS test endpoint

## Common Issues and Solutions

### 502 Bad Gateway Error
This usually means:
1. The server is not starting properly
2. Database connection is failing
3. Environment variables are missing

### CORS Errors
The updated configuration should handle:
- Preflight OPTIONS requests
- All HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Required headers including Authorization
- Credentials for authenticated requests

## Deployment Steps

1. Push your changes to your repository
2. Render will automatically redeploy
3. Check the Render logs for any startup errors
4. Test the health endpoint to verify the server is running
5. Test your frontend to ensure CORS is working

## Debugging

If you're still experiencing issues:

1. Check Render deployment logs
2. Test the health endpoint directly in browser
3. Check browser developer tools for specific error messages
4. Verify all environment variables are set correctly
