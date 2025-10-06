# 🚀 Render Deployment Guide - Judge0 with All Languages

## 🎯 **Goal**: Deploy Judge0 with Python, JavaScript, Java, C++, C support for 200 students

## 📋 **Prerequisites**
- ✅ Render.com account
- ✅ GitHub repository with Judge0 code
- ✅ 30 minutes for deployment

## 🚀 **Step-by-Step Deployment**

### **Step 1: Prepare Repository**
1. **Commit new files** to your repository:
   ```bash
   git add .
   git commit -m "Add official Judge0 Dockerfiles with all language compilers"
   git push origin main
   ```

### **Step 2: Create New Render Services**

#### **2.1: Create Database**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. **Name**: `judge0-db`
4. **Plan**: Starter (Free)
5. **Region**: Oregon (or closest to your users)
6. Click **"Create Database"**
7. **Note the connection string** (you'll need it later)

#### **2.2: Create Redis**
1. Click **"New +"** → **"Redis"**
2. **Name**: `judge0-redis`
3. **Plan**: Starter (Free)
4. **Region**: Oregon (same as database)
5. Click **"Create Redis"**
6. **Note the connection string**

#### **2.3: Create Judge0 API**
1. Click **"New +"** → **"Web Service"**
2. **Connect Repository**: Your GitHub repository
3. **Configuration**:
   - **Name**: `judge0-api-full`
   - **Root Directory**: `judge0-render`
   - **Environment**: Docker
   - **Dockerfile Path**: `Dockerfile-official`
   - **Plan**: Starter (Free)
   - **Region**: Oregon

4. **Environment Variables**:
   ```
   PORT=2358
   RAILS_ENV=production
   RACK_ENV=production
   DATABASE_URL=[from judge0-db connection string]
   REDIS_URL=[from judge0-redis connection string]
   SECRET_KEY_BASE=[generate random string]
   ```

5. Click **"Create Web Service"**

#### **2.4: Create Judge0 Worker**
1. Click **"New +"** → **"Background Worker"**
2. **Connect Repository**: Your GitHub repository
3. **Configuration**:
   - **Name**: `judge0-worker-full`
   - **Root Directory**: `judge0-render`
   - **Environment**: Docker
   - **Dockerfile Path**: `Dockerfile-worker-official`
   - **Plan**: Starter (Free)
   - **Region**: Oregon

4. **Environment Variables**:
   ```
   DATABASE_URL=[from judge0-db connection string]
   REDIS_URL=[from judge0-redis connection string]
   ```

5. Click **"Create Background Worker"**

### **Step 3: Wait for Deployment**
- **API Service**: 5-10 minutes
- **Worker Service**: 5-10 minutes
- **Database**: 2-3 minutes
- **Redis**: 2-3 minutes

### **Step 4: Test Deployment**

#### **4.1: Health Check**
```bash
# Test API health
curl https://your-judge0-api-full.onrender.com/

# Test worker health (if exposed)
curl https://your-judge0-worker-full.onrender.com/
```

#### **4.2: Test All Languages**
```bash
# Run the test script
cd Backend
node test-all-languages-new.js
```

### **Step 5: Update Backend Configuration**

#### **5.1: Update Judge0 Service**
```javascript
// In Backend/services/judge0.js
const JUDGE0_INSTANCES = [
  'https://your-judge0-api-full.onrender.com',  // Your new deployment
  'https://judge0-api-b0cf.onrender.com',      // Fallback
  'http://localhost:2358'                      // Local fallback
];
```

#### **5.2: Test Backend Integration**
```bash
# Test with your backend
cd Backend
npm start
```

## 🎯 **Expected Results**

After deployment, you'll have:
- ✅ **Python**: Full support
- ✅ **JavaScript**: Node.js execution
- ✅ **Java**: OpenJDK compilation and execution
- ✅ **C++**: GCC compilation and execution
- ✅ **C**: GCC compilation and execution
- ✅ **200+ concurrent students**
- ✅ **Sub-second response times**

## 📊 **Capacity for 200 Students**

### **Render Free Tier Limits**
- **API**: 750 hours/month (enough for 24/7)
- **Worker**: 750 hours/month (enough for 24/7)
- **Database**: 1GB storage (sufficient for submissions)
- **Redis**: 25MB storage (sufficient for job queue)

### **Performance Expectations**
- **Concurrent Users**: 50-100 (free tier)
- **For 200 students**: Consider upgrading to paid plans
- **Response Time**: 2-5 seconds per submission
- **Availability**: 99.9% uptime

## 🔧 **Troubleshooting**

### **Common Issues**
1. **Build Failures**: Check Dockerfile syntax
2. **Database Connection**: Verify connection strings
3. **Redis Connection**: Check Redis URL format
4. **Worker Not Processing**: Check worker logs

### **Debug Commands**
```bash
# Check API logs
# Go to Render Dashboard → Your API Service → Logs

# Check worker logs  
# Go to Render Dashboard → Your Worker Service → Logs

# Test database connection
psql [DATABASE_URL]
```

## 🎉 **Success Indicators**

You'll know it's working when:
- ✅ All services show "Live" status
- ✅ Health checks return "healthy"
- ✅ All 5 languages execute successfully
- ✅ Backend can submit and get results

## 📞 **Next Steps**

1. **Deploy**: Follow steps 1-4
2. **Test**: Run language tests
3. **Update**: Configure backend
4. **Scale**: Monitor performance and upgrade if needed

Ready to deploy? Let's get started! 🚀
