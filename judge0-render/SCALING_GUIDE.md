# Judge0 Scaling Guide for 200+ Simultaneous Students

## 🎯 **Current Capacity Analysis**

### ✅ **Backend Server (Node.js)**
- **WebSocket Connections**: 600 max ✅ (sufficient for 200 students)
- **MongoDB Pool**: 400 max connections ✅ (sufficient)
- **Memory Management**: Optimized for 500+ users ✅
- **CORS & Security**: Properly configured ✅

### ⚠️ **Judge0 Worker (Python) - NEEDS SCALING**
- **Database Pool**: 10-50 connections ✅ (updated)
- **Worker Processes**: 1 default ❌ (needs multiple workers)
- **Queue Processing**: Single-threaded ❌ (needs parallel processing)

## 🚀 **Scaling Solutions**

### 1. **Multiple Worker Processes** (Recommended)

Run multiple Judge0 workers to handle concurrent submissions:

#### Windows:
```batch
# Run the batch script
judge0-render/start-multiple-workers.bat
```

#### Linux/Mac:
```bash
# Run the shell script
chmod +x judge0-render/start-multiple-workers.sh
./judge0-render/start-multiple-workers.sh
```

#### Manual Setup:
```bash
# Start 4 workers (adjust based on server capacity)
cd judge0-render/worker
PORT=2359 python queue_worker.py &
PORT=2360 python queue_worker.py &
PORT=2361 python queue_worker.py &
PORT=2362 python queue_worker.py &
```

### 2. **Server Resource Requirements**

#### Minimum Requirements for 200 Students:
- **CPU**: 4+ cores (2 cores per worker)
- **RAM**: 8GB+ (4GB for workers + 4GB for API/database)
- **Storage**: 20GB+ SSD
- **Network**: 100 Mbps+ bandwidth

#### Recommended for Production:
- **CPU**: 8+ cores (4 cores per worker)
- **RAM**: 16GB+ (8GB for workers + 8GB for API/database)
- **Storage**: 50GB+ SSD
- **Network**: 1 Gbps bandwidth

### 3. **Database Optimization**

#### PostgreSQL Configuration:
```sql
-- Increase connection limits
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- Restart PostgreSQL to apply changes
```

#### Redis Configuration:
```conf
# redis.conf optimizations
maxmemory 512mb
maxmemory-policy allkeys-lru
tcp-keepalive 60
timeout 300
```

### 4. **Load Balancing (Advanced)**

For multiple servers, use a load balancer:

#### Nginx Configuration:
```nginx
upstream judge0_workers {
    server localhost:2359;
    server localhost:2360;
    server localhost:2361;
    server localhost:2362;
}

server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://judge0_workers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 📊 **Performance Monitoring**

### 1. **Monitor Worker Performance**
```bash
# Check worker processes
ps aux | grep queue_worker

# Monitor queue length
redis-cli llen submission_queue

# Check database connections
psql -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

### 2. **Key Metrics to Track**
- **Queue Length**: Should stay under 50 submissions
- **Processing Time**: Average < 5 seconds per submission
- **Error Rate**: Should be < 1%
- **Memory Usage**: Keep under 80% of available RAM
- **CPU Usage**: Keep under 80% per core

### 3. **Alert Thresholds**
- Queue length > 100 submissions
- Processing time > 10 seconds average
- Error rate > 5%
- Memory usage > 90%
- CPU usage > 90%

## 🔧 **Configuration Tuning**

### 1. **Judge0 Worker Settings**
```python
# In queue_worker.py
MAX_CONCURRENT_SUBMISSIONS = 50  # Per worker
QUEUE_POLL_INTERVAL = 1  # seconds
EXECUTION_TIMEOUT = 10  # seconds
MEMORY_LIMIT = 512  # MB per submission
```

### 2. **Backend Rate Limiting**
```javascript
// In server.js - add rate limiting
const rateLimit = require('express-rate-limit');

const judge0Limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many code execution requests, please try again later.'
});

app.use('/api/coding', judge0Limiter);
```

## 🚨 **Troubleshooting High Load**

### 1. **Queue Backlog**
```bash
# If queue gets too long, restart workers
pkill -f queue_worker.py
./start-multiple-workers.sh
```

### 2. **Memory Issues**
```bash
# Monitor memory usage
free -h
top -p $(pgrep -f queue_worker.py)

# Restart if memory usage is too high
```

### 3. **Database Connection Issues**
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Kill long-running queries if needed
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 minutes';
```

## 📈 **Scaling Beyond 200 Students**

### For 500+ Students:
1. **Multiple Servers**: Deploy Judge0 on multiple machines
2. **Load Balancer**: Use HAProxy or Nginx for distribution
3. **Database Clustering**: PostgreSQL read replicas
4. **Redis Cluster**: For queue distribution
5. **Container Orchestration**: Docker Swarm or Kubernetes

### For 1000+ Students:
1. **Microservices Architecture**: Separate API and Worker services
2. **Message Queue**: RabbitMQ or Apache Kafka
3. **Auto-scaling**: Cloud-based auto-scaling groups
4. **CDN**: For static assets and caching

## 💡 **Best Practices**

1. **Start Small**: Begin with 2-4 workers and monitor
2. **Gradual Scaling**: Increase workers based on actual load
3. **Monitor Everything**: Set up comprehensive monitoring
4. **Test Load**: Use load testing tools before production
5. **Plan for Failures**: Have backup servers ready
6. **Regular Maintenance**: Monitor and optimize regularly

## 🔍 **Testing Load Capacity**

```bash
# Use Apache Bench for load testing
ab -n 1000 -c 50 -T 'application/json' -p test_submission.json http://localhost:4000/api/coding/run

# Monitor system resources during test
htop
iotop
netstat -tuln
```

---

**Remember**: Always test your scaling configuration with a smaller load first, then gradually increase to your target capacity of 200 students.
