# 🚀 Complete Setup for All 5 Languages + 200 Students

## 🎯 **Goal**: Python, JavaScript, Java, C++, C support for 200 concurrent students

## 📋 **Option 1: Free RapidAPI Judge0 (Fastest Setup)**

### **Step 1: Get Free API Key**
1. Go to [RapidAPI Judge0](https://rapidapi.com/judge0-official/api/judge0-ce)
2. Sign up for free account
3. Subscribe to "Basic" plan (FREE tier: 100 requests/day)
4. Copy your API key

### **Step 2: Update Backend Configuration**
```javascript
// In Backend/services/judge0.js
const JUDGE0_INSTANCES = [
  'https://judge0-ce.p.rapidapi.com',  // Official Judge0 with all languages
  'https://judge0-api-b0cf.onrender.com',  // Your deployed instance (Python)
  'http://localhost:2358'  // Local fallback
];

// Add API key header
const headers = {
  'Content-Type': 'application/json',
  'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || 'your-api-key-here',
  'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
};
```

### **Step 3: Test All Languages**
```bash
# Test script will verify all 5 languages work
node test-all-languages.js
```

---

## 📋 **Option 2: Deploy Official Judge0 Docker (Best Performance)**

### **Step 1: Update Render Deployment**

**API Service Configuration:**
```yaml
# render.yaml
services:
  - type: web
    name: judge0-api-full
    env: docker
    dockerfilePath: ./Dockerfile-official
    envVars:
      - key: PORT
        value: 2358
      - key: RAILS_ENV
        value: production
```

**Worker Service Configuration:**
```yaml
  - type: worker
    name: judge0-worker-full
    env: docker
    dockerfilePath: ./Dockerfile-worker-official
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: judge0-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          type: redis
          name: judge0-redis
          property: connectionString
```

### **Step 2: Deploy to Render**
1. Update your repository with new Dockerfiles
2. Redeploy API and Worker services
3. Test all languages

---

## 📋 **Option 3: Local Docker Setup (Full Control)**

### **Step 1: Install Docker Desktop**
```powershell
# Download and install Docker Desktop for Windows
# https://www.docker.com/products/docker-desktop
```

### **Step 2: Run Official Judge0**
```bash
# Start Judge0 API
docker run -d \
  --name judge0-api \
  -p 2358:2358 \
  judge0/judge0:1.13.0

# Start Judge0 Worker
docker run -d \
  --name judge0-worker \
  --link judge0-api:api \
  judge0/judge0:1.13.0 \
  python3 worker/queue_worker.py
```

### **Step 3: Update Backend**
```javascript
// In Backend/services/judge0.js
const JUDGE0_INSTANCES = [
  'http://localhost:2358',  // Local Docker instance
  'https://judge0-api-b0cf.onrender.com',  // Your deployed instance
];
```

---

## 🧪 **Test All Languages**

### **Create Test Script**
```javascript
// test-all-languages.js
const { runAgainstCases } = require('./services/judge0');

const languages = [
  { name: 'Python', code: 'print("Hello Python!")', expected: 'Hello Python!' },
  { name: 'JavaScript', code: 'console.log("Hello JavaScript!");', expected: 'Hello JavaScript!' },
  { name: 'Java', code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello Java!");
    }
}`, expected: 'Hello Java!' },
  { name: 'C++', code: `#include <iostream>
int main() {
    std::cout << "Hello C++!" << std::endl;
    return 0;
}`, expected: 'Hello C++!' },
  { name: 'C', code: `#include <stdio.h>
int main() {
    printf("Hello C!\\n");
    return 0;
}`, expected: 'Hello C!' }
];

async function testAllLanguages() {
  for (const lang of languages) {
    console.log(`\\n🧪 Testing ${lang.name}...`);
    try {
      const results = await runAgainstCases({
        sourceCode: lang.code,
        language: lang.name.toLowerCase(),
        cases: [{ input: '', output: lang.expected }]
      });
      
      if (results[0]?.passed) {
        console.log(`✅ ${lang.name}: PASSED`);
      } else {
        console.log(`❌ ${lang.name}: FAILED - ${results[0]?.status?.description}`);
      }
    } catch (error) {
      console.log(`❌ ${lang.name}: ERROR - ${error.message}`);
    }
  }
}

testAllLanguages();
```

---

## 📊 **Capacity Planning for 200 Students**

### **Resource Requirements**
- **CPU**: 8+ cores (4 cores per 100 students)
- **RAM**: 16GB+ (8GB for workers + 8GB for API)
- **Storage**: 50GB+ SSD
- **Network**: 1 Gbps bandwidth

### **Scaling Configuration**
```javascript
// Backend rate limiting for 200 students
const rateLimit = require('express-rate-limit');

const judge0Limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP
  message: 'Rate limit exceeded for Judge0 requests'
});

app.use('/api/coding', judge0Limiter);
```

### **Multiple Worker Processes**
```bash
# Start 4 worker processes for high concurrency
for i in {1..4}; do
  docker run -d --name judge0-worker-$i judge0/judge0:1.13.0
done
```

---

## 🎯 **Recommended Solution**

### **For Immediate Setup (5 minutes)**
1. **Use RapidAPI Judge0** (Option 1)
   - Sign up for free account
   - Get API key
   - Update backend configuration
   - Test all languages

### **For Production (30 minutes)**
1. **Deploy Official Docker Image** (Option 2)
   - Update Render deployment
   - Deploy with official Judge0 Docker
   - Full control and performance

### **For Development (10 minutes)**
1. **Local Docker Setup** (Option 3)
   - Install Docker Desktop
   - Run official Judge0 locally
   - Test and develop

---

## 🎉 **Expected Results**

After setup, you'll have:
- ✅ **Python**: Full support
- ✅ **JavaScript**: Node.js execution
- ✅ **Java**: OpenJDK compilation and execution
- ✅ **C++**: GCC compilation and execution
- ✅ **C**: GCC compilation and execution
- ✅ **200+ concurrent students**
- ✅ **Sub-second response times**
- ✅ **Reliable execution**

Choose the option that best fits your timeline and requirements!
