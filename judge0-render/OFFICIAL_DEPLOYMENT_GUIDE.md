# Official Judge0 Deployment on Render

This guide deploys Judge0 using the **official Judge0 repository structure** for maximum compatibility and reliability.

## 🎯 **What This Deployment Provides**

✅ **Official Judge0 CE** with 60+ programming languages  
✅ **Full Language Support**: Python, JavaScript, Java, C++, C, Go, Ruby, and more  
✅ **Production Ready**: Based on official Judge0 repository  
✅ **Scalable**: Supports 200+ concurrent users  
✅ **Secure**: Uses official isolate sandboxing  
✅ **Reliable**: Official Docker images and scripts  

## 📋 **Prerequisites**

1. **Render.com account**
2. **GitHub repository** with this code
3. **Basic understanding** of Render deployment

## 🚀 **Step-by-Step Deployment**

### **Step 1: Create Database**

1. Go to Render Dashboard
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `judge0-db`
   - **Plan**: Starter ($7/month)
   - **Region**: Oregon (or your preferred)
4. Click **"Create Database"**
5. **Note down** the connection details

### **Step 2: Create Redis**

1. Click **"New +"** → **"Redis"**
2. Configure:
   - **Name**: `judge0-redis`
   - **Plan**: Starter ($7/month)
   - **Region**: Same as database
3. Click **"Create Redis"**
4. **Note down** the connection details

### **Step 3: Deploy API Service**

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `judge0-api-official`
   - **Root Directory**: `judge0-render/api`
   - **Environment**: Docker
   - **Plan**: Starter ($7/month)
   - **Region**: Same as database
   - **Dockerfile Path**: `Dockerfile`

4. **Environment Variables** (Render will auto-populate from render.yaml):
   - `POSTGRES_HOST` (from database)
   - `POSTGRES_PORT` (from database)
   - `POSTGRES_DB` (from database)
   - `POSTGRES_USER` (from database)
   - `POSTGRES_PASSWORD` (from database)
   - `REDIS_HOST` (from Redis)
   - `REDIS_PORT` (from Redis)
   - `REDIS_PASSWORD` (from Redis)
   - `SECRET_KEY_BASE` (auto-generated)

5. Click **"Create Web Service"**

### **Step 4: Deploy Worker Service**

1. Click **"New +"** → **"Background Worker"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `judge0-worker-official`
   - **Root Directory**: `judge0-render/worker`
   - **Environment**: Docker
   - **Plan**: Starter ($7/month)
   - **Region**: Same as database
   - **Dockerfile Path**: `Dockerfile`

4. **Environment Variables** (same as API service)

5. Click **"Create Background Worker"**

## 🔧 **File Structure**

```
judge0-render/
├── api/
│   ├── Dockerfile          # Official Judge0 API
│   ├── judge0.conf         # Configuration file
│   └── render.yaml         # Render deployment config
└── worker/
    ├── Dockerfile          # Official Judge0 Worker
    ├── judge0.conf         # Configuration file
    └── render.yaml         # Render deployment config
```

## ⚙️ **Configuration Details**

### **Dockerfiles**
- **API**: Uses `judge0/judge0:latest` with `/api/scripts/server`
- **Worker**: Uses `judge0/judge0:latest` with `/api/scripts/workers`

### **Configuration File (judge0.conf)**
- **Telemetry**: Disabled for privacy
- **Workers**: 4 concurrent workers
- **Queue Size**: 100 submissions
- **Time Limits**: 5s CPU, 10s wall clock
- **Memory Limit**: 128MB per submission
- **Languages**: All 60+ languages supported

## 📊 **Scaling for 200+ Users**

### **Current Setup**
- **API**: 1 instance, 4 threads
- **Worker**: 4 concurrent workers
- **Database**: Shared connection pool
- **Redis**: Shared queue

### **For Higher Load**
1. **Upgrade Plans**: 
   - API: Standard ($25/month)
   - Worker: Standard ($25/month)
   - Database: Standard ($25/month)

2. **Multiple Workers**: 
   - Deploy additional worker services
   - Each worker handles 50+ concurrent submissions

3. **Load Balancing**:
   - Multiple API instances
   - Render handles load balancing automatically

## 🧪 **Testing Your Deployment**

### **1. Health Check**
```bash
curl https://your-api-url.onrender.com/ping
```

### **2. Test Code Execution**
```bash
curl -X POST https://your-api-url.onrender.com/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "source_code": "print(\"Hello World\")",
    "language_id": 71,
    "stdin": ""
  }'
```

### **3. Get Results**
```bash
curl https://your-api-url.onrender.com/submissions/{submission_id}
```

## 🔗 **Update Your Application**

Update your `Backend/services/judge0.js`:

```javascript
const JUDGE0_INSTANCES = [
  'https://your-judge0-api.onrender.com',  // Your new API URL
  'http://localhost:2358'  // Local fallback
];
```

## 💰 **Cost Breakdown**

### **Monthly Costs**
- **Database**: $7 (Starter)
- **Redis**: $7 (Starter)  
- **API Service**: $7 (Starter)
- **Worker Service**: $7 (Starter)
- **Total**: ~$28/month

### **Free Tier Alternative**
- Use **Render's free tier** (limited hours)
- **Database**: Free (with limitations)
- **Redis**: Free (with limitations)
- **Services**: Free (750 hours/month)

## 🛠️ **Troubleshooting**

### **Common Issues**

1. **Build Failures**:
   - Check Dockerfile paths
   - Verify configuration files

2. **Connection Errors**:
   - Verify environment variables
   - Check database/Redis connectivity

3. **Performance Issues**:
   - Upgrade to higher plans
   - Add more worker instances

### **Logs**
- **API Logs**: Render dashboard → API service → Logs
- **Worker Logs**: Render dashboard → Worker service → Logs

## 🎉 **Benefits of Official Deployment**

✅ **Reliability**: Official Judge0 repository  
✅ **Security**: Official isolate sandboxing  
✅ **Performance**: Optimized for production  
✅ **Support**: Official documentation  
✅ **Updates**: Easy to update to new versions  
✅ **Languages**: Full 60+ language support  

## 📚 **Next Steps**

1. **Deploy** following this guide
2. **Test** with your application
3. **Monitor** performance and logs
4. **Scale** as needed for your users
5. **Update** your application's Judge0 URL

Your Judge0 instance will be production-ready with full language support for all 200+ students! 🚀
