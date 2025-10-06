#!/bin/bash
# Start multiple Judge0 workers for high concurrency (200+ students)

echo "🚀 Starting multiple Judge0 workers for high concurrency..."

# Number of worker processes (adjust based on your server capacity)
WORKER_COUNT=4

# Kill any existing workers
pkill -f "python.*queue_worker.py" 2>/dev/null || true
sleep 2

# Start multiple worker processes
for i in $(seq 1 $WORKER_COUNT); do
    echo "🔄 Starting worker $i/$WORKER_COUNT..."
    cd worker
    PORT=$((2358 + i)) python queue_worker.py &
    cd ..
    sleep 1
done

echo "✅ Started $WORKER_COUNT Judge0 workers"
echo "📊 Workers listening on ports: 2359-$((2358 + WORKER_COUNT))"
echo "🔍 Monitor with: ps aux | grep queue_worker"
echo "🛑 Stop all workers with: pkill -f queue_worker.py"
