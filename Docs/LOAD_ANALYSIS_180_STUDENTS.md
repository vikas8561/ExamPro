# 📊 Load Analysis - 180 Students Simultaneous Exams

## **Current Rate Limit:**
- **300 requests per minute** for both auth and API routes

## **Load Calculation for 180 Students:**

### **During Exam Session:**

#### **1. Initial Login (180 students):**
- **Login requests**: 180 requests
- **Time window**: ~2-3 minutes (students logging in gradually)
- **Rate**: ~60-90 requests per minute ✅ **SUFFICIENT**

#### **2. Exam Navigation & Questions:**
- **Page loads**: ~5-10 per student per minute
- **API calls**: ~3-5 per student per minute
- **Total per student**: ~8-15 requests per minute
- **180 students**: 1,440 - 2,700 requests per minute ❌ **INSUFFICIENT**

#### **3. Answer Submissions:**
- **Auto-save**: Every 30 seconds = 2 per minute per student
- **Manual saves**: ~1-2 per minute per student
- **180 students**: 540 - 720 requests per minute ❌ **INSUFFICIENT**

#### **4. Real-time Features:**
- **Heartbeat/keepalive**: Every 10-15 seconds
- **Progress updates**: Every 30 seconds
- **180 students**: 720 - 1,080 requests per minute ❌ **INSUFFICIENT**

## **🚨 RECOMMENDATION: INCREASE TO 2000+ PER MINUTE**

### **Suggested Rate Limits:**
```javascript
const authRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  2000, // 2000 requests per minute
  'Too many authentication attempts, please try again later.'
);

const apiRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  2000, // 2000 requests per minute
  'API rate limit exceeded, please slow down.'
);
```

### **Why 2000+ is needed:**
- **Peak load**: 2,700 requests per minute during active exam
- **Safety margin**: 25% buffer for unexpected spikes
- **Real-time features**: Heartbeat, auto-save, progress updates
- **Error retries**: Failed requests that need to be retried

## **📈 Load Breakdown:**

| Activity | Requests/Min/Student | 180 Students | Total/Min |
|----------|---------------------|--------------|-----------|
| **Login** | 1 | 180 | 180 |
| **Page Navigation** | 5-10 | 180 | 900-1,800 |
| **Answer Submissions** | 3-5 | 180 | 540-900 |
| **Auto-save** | 2 | 180 | 360 |
| **Heartbeat** | 4-6 | 180 | 720-1,080 |
| **Progress Updates** | 2 | 180 | 360 |
| **TOTAL** | **17-33** | **180** | **3,060-4,680** |

## **🎯 OPTIMAL RATE LIMITS:**

### **For 180 Students:**
- **Auth Routes**: 500 requests per minute (login only)
- **API Routes**: 2500 requests per minute (exam activities)
- **General Routes**: 1000 requests per 15 minutes

### **For Future Scaling:**
- **500 Students**: 5000+ requests per minute
- **1000 Students**: 10000+ requests per minute

## **⚡ IMMEDIATE ACTION NEEDED:**

**Current 300 requests/minute will cause:**
- ❌ **429 errors** during exam
- ❌ **Failed submissions**
- ❌ **Poor user experience**
- ❌ **Students unable to complete exams**

**Recommended 2000+ requests/minute will provide:**
- ✅ **Smooth exam experience**
- ✅ **No rate limiting issues**
- ✅ **Reliable auto-save**
- ✅ **Real-time features working**

---

**🚨 URGENT: Rate limits need to be increased to 2000+ per minute for 180 simultaneous students!**
