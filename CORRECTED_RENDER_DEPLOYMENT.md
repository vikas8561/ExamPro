# 🚀 Corrected Render Deployment Guide - Judge0 with All Languages

## 🎯 **Goal**: Deploy Judge0 API and Worker separately with all language support

## 📁 **Correct Deployment Structure**

```
judge0-render/
├── api/
│   ├── Dockerfile          ← API service deployed from here
│   ├── render.yaml         ← API deployment config
│   └── [all existing API files]
└── worker/
    ├── Dockerfile          ← Worker service deployed from here
    ├── render.yaml         ← Worker deployment config
    └── [all existing worker files]
```

## 🚀 **Step-by-Step Deployment**

### **Step 1: Prepare Repository**
1. **Commit new files** to your repository:
   ```bash
   git add .
   git commit -m "Add Dockerfiles to API and Worker folders for separate deployment"
   git push origin main
   ```

### **Step 2: Create Database and Redis (Shared Services)**

#### **2.1: Create Database**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. **Name**: `judge0-db`
4. **Plan**: Starter (Free)
5. **Region**: Oregon
6. Click **"Create Database"**
7. **Copy the connection string**

#### **2.2: Create Redis**
1. Click **"New +"** → **"Redis"**
2. **Name**: `judge0-redis`
3. **Plan**: Starter (Free)
4. **Region**: Oregon
5. Click **"Create Redis"**
6. **Copy the connection string**

### **Step 3: Deploy API Service**

#### **3.1: Create API Web Service**
1. Click **"New +"** → **"Web Service"**
2. **Connect Repository**: Your GitHub repository
3. **Configuration**:
   - **Name**: `judge0-api-full`
   - **Root Directory**: `judge0-render/api` ← **IMPORTANT: Use api folder**
   - **Environment**: Docker
   - **Dockerfile Path**: `Dockerfile` ← **IMPORTANT: No path needed**
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

### **Step 4: Deploy Worker Service**

#### **4.1: Create Worker Background Service**
1. Click **"New +"** → **"Background Worker"**
2. **Connect Repository**: Your GitHub repository
3. **Configuration**:
   - **Name**: `judge0-worker-full`
   - **Root Directory**: `judge0-render/worker` ← **IMPORTANT: Use worker folder**
   - **Environment**: Docker
   - **Dockerfile Path**: `Dockerfile` ← **IMPORTANT: No path needed**
   - **Plan**: Starter (Free)
   - **Region**: Oregon

4. **Environment Variables**:
   ```
   DATABASE_URL=[from judge0-db connection string]
   REDIS_URL=[from judge0-redis connection string]
   ```

5. Click **"Create Background Worker"**

### **Step 5: Wait for Deployment**
- **Database**: 2-3 minutes
- **Redis**: 2-3 minutes
- **API Service**: 5-10 minutes
- **Worker Service**: 5-10 minutes

### **Step 6: Test Deployment**

#### **6.1: Get Your API URL**
1. Go to Render Dashboard
2. Click on `judge0-api-full` service
3. **Copy the URL** (e.g., `https://judge0-api-full-xxx.onrender.com`)

#### **6.2: Test API Health**
```bash
# Replace with your actual URL
curl https://your-judge0-api-full.onrender.com/
```

#### **6.3: Test All Languages**
```bash
cd Backend
# Update the URL in the test script first
node test-all-languages-new.js
```

### **Step 7: Update Backend Configuration**

#### **7.1: Update Judge0 Service**
```javascript
// In Backend/services/judge0.js
const JUDGE0_INSTANCES = [
  'https://your-judge0-api-full.onrender.com',  // Your new deployment
  'https://judge0-api-b0cf.onrender.com',      // Fallback
  'http://localhost:2358'                      // Local fallback
];
```

## 🎯 **Key Differences from Previous Guide**

### ✅ **Correct Structure**
- **API**: Deployed from `judge0-render/api/` folder
- **Worker**: Deployed from `judge0-render/worker/` folder
- **Dockerfiles**: Inside each respective folder
- **Config**: Separate render.yaml files

### ❌ **Previous Mistakes**
- ❌ Dockerfiles in wrong location
- ❌ Single render.yaml for both services
- ❌ Wrong root directory paths

## 📊 **Expected Results**

After correct deployment:
- ✅ **API Service**: `https://judge0-api-full-xxx.onrender.com`
- ✅ **Worker Service**: Running in background
- ✅ **All 5 Languages**: Python, JavaScript, Java, C++, C
- ✅ **200+ Students**: Concurrent support

## 🔧 **Troubleshooting**

### **Common Issues**
1. **Build Failures**: Check Dockerfile is in correct folder
2. **Wrong Directory**: Ensure root directory points to `api` or `worker`
3. **Missing Files**: Verify all files are in correct folders

### **Debug Steps**
1. **Check Service Logs**: Render Dashboard → Service → Logs
2. **Verify Dockerfile**: Ensure it's in the service's root directory
3. **Check Environment Variables**: Verify DATABASE_URL and REDIS_URL

## 🎉 **Success Indicators**

You'll know it's working when:
- ✅ API service shows "Live" status
- ✅ Worker service shows "Running" status
- ✅ Health check returns "healthy"
- ✅ All 5 languages execute successfully

## 📞 **Next Steps**

1. **Deploy**: Follow corrected steps 1-6
2. **Test**: Run language tests
3. **Update**: Configure backend with new URL
4. **Scale**: Monitor and upgrade if needed

This corrected structure will work properly with Render's separate service deployment! 🚀
