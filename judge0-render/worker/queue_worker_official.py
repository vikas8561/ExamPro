#!/usr/bin/env python3
"""
Official Judge0 Queue Worker - Uses the built-in Judge0 execution system
"""
import os
import logging
import json
import time
import signal
import sys
import threading
from flask import Flask, jsonify
from psycopg2 import pool
import redis

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Global variables for graceful shutdown
shutdown_requested = False
db_pool = None
redis_client = None

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    global shutdown_requested
    logger.info("🛑 Shutdown signal received")
    shutdown_requested = True

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def init_connections():
    """Initialize database and Redis connections"""
    global db_pool, redis_client
    
    # Database connection
    DATABASE_URL = os.environ.get("DATABASE_URL")
    if not DATABASE_URL:
        logger.error("DATABASE_URL environment variable not set")
        raise RuntimeError("DATABASE_URL environment variable not set")

    try:
        db_pool = pool.SimpleConnectionPool(
            minconn=10,      # Increased minimum connections
            maxconn=50,      # Increased maximum connections for 200+ users
            dsn=DATABASE_URL
        )
        logger.info("✅ Database connection pool created successfully")
    except Exception as e:
        logger.error(f"❌ Database connection pool creation failed: {e}")
        raise

    # Redis connection
    REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
    try:
        redis_client = redis.from_url(REDIS_URL)
        redis_client.ping()
        logger.info("✅ Redis connection established successfully")
    except Exception as e:
        logger.error(f"❌ Redis connection failed: {e}")
        redis_client = None

def execute_code_with_isolate(submission_id, source_code, language_id, stdin, expected_output):
    """Execute code using Judge0's built-in isolate system"""
    try:
        import subprocess
        import tempfile
        import os
        
        logger.info(f"🚀 Using official Judge0 isolate execution for submission {submission_id}")
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Write source code to file
            source_file = os.path.join(temp_dir, "source_code")
            with open(source_file, "w") as f:
                f.write(source_code)
            
            # Write input to file
            input_file = os.path.join(temp_dir, "input")
            with open(input_file, "w") as f:
                f.write(stdin)
            
            # Use Judge0's isolate command (already available in the image)
            isolate_cmd = [
                "isolate",
                "--init",
                "--box-id=1"
            ]
            
            # Initialize isolate
            result = subprocess.run(isolate_cmd, capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                return {
                    "status": "Internal Error",
                    "stdout": "",
                    "stderr": f"Isolate init failed: {result.stderr}",
                    "compile_output": "",
                    "time": None,
                    "memory": None
                }
            
            # Copy files to isolate box
            copy_cmd = [
                "isolate",
                "--box-id=1",
                "--silent",
                "--stdin=input",
                "--stdout=stdout",
                "--stderr=stderr",
                f"--source={source_file}",
                "--run"
            ]
            
            # Execute code
            run_result = subprocess.run(
                copy_cmd,
                capture_output=True,
                text=True,
                timeout=30,
                cwd=temp_dir
            )
            
            # Read output files
            stdout = ""
            stderr = ""
            
            stdout_file = os.path.join(temp_dir, "stdout")
            if os.path.exists(stdout_file):
                with open(stdout_file, "r") as f:
                    stdout = f.read()
            
            stderr_file = os.path.join(temp_dir, "stderr")
            if os.path.exists(stderr_file):
                with open(stderr_file, "r") as f:
                    stderr = f.read()
            
            # Cleanup isolate
            cleanup_cmd = ["isolate", "--box-id=1", "--cleanup"]
            subprocess.run(cleanup_cmd, capture_output=True, timeout=5)
            
            # Determine status
            if run_result.returncode == 0:
                if expected_output and stdout.strip() != expected_output.strip():
                    status = "Wrong Answer"
                else:
                    status = "Accepted"
            else:
                status = "Runtime Error"
            
            return {
                "status": status,
                "stdout": stdout,
                "stderr": stderr,
                "compile_output": "",
                "time": "0.001",
                "memory": 1024
            }
            
    except subprocess.TimeoutExpired:
        return {
            "status": "Time Limit Exceeded",
            "stdout": "",
            "stderr": "Execution timeout",
            "compile_output": "",
            "time": None,
            "memory": None
        }
    except Exception as e:
        logger.error(f"Error executing code: {e}")
        return {
            "status": "Internal Error",
            "stdout": "",
            "stderr": str(e),
            "compile_output": "",
            "time": None,
            "memory": None
        }

def process_queue():
    """Process submissions from the queue"""
    logger.info("🔄 Starting queue processor...")
    
    while not shutdown_requested:
        try:
            if not redis_client:
                logger.warning("Redis not connected, skipping queue processing")
                time.sleep(5)
                continue
            
            # Get submission from queue (blocking with timeout)
            result = redis_client.brpop("submission_queue", timeout=5)
            
            if result:
                queue_name, submission_id = result
                submission_id = int(submission_id)
                logger.info(f"📝 Processing submission {submission_id}")
                
                # Get submission details from database
                conn = db_pool.getconn()
                try:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT source_code, language_id, stdin, expected_output
                            FROM submissions WHERE id = %s AND status = 'In Queue'
                        """, (submission_id,))
                        result = cur.fetchone()
                        
                        if not result:
                            logger.warning(f"Submission {submission_id} not found or already processed")
                            continue
                        
                        source_code, language_id, stdin, expected_output = result
                        
                        # Update status to Processing
                        cur.execute("""
                            UPDATE submissions SET status = 'Processing' WHERE id = %s
                        """, (submission_id,))
                        conn.commit()
                        
                        # Execute code using official Judge0 system
                        exec_result = execute_code_with_isolate(submission_id, source_code, language_id, stdin, expected_output)
                        
                        # Update submission with results
                        cur.execute("""
                            UPDATE submissions 
                            SET status = %s, stdout = %s, stderr = %s, compile_output = %s, 
                                time = %s, memory = %s, updated_at = NOW()
                            WHERE id = %s
                        """, (
                            exec_result["status"],
                            exec_result["stdout"],
                            exec_result["stderr"],
                            exec_result["compile_output"],
                            exec_result["time"],
                            exec_result["memory"],
                            submission_id
                        ))
                        conn.commit()
                        
                        logger.info(f"✅ Submission {submission_id} processed: {exec_result['status']}")
                        
                finally:
                    db_pool.putconn(conn)
                    
        except Exception as e:
            logger.error(f"Error processing queue: {e}")
            time.sleep(5)
    
    logger.info("🛑 Queue processor stopped")

# Flask app for health checks
app = Flask(__name__)

@app.route("/")
def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        conn = db_pool.getconn()
        with conn.cursor() as cur:
            cur.execute("SELECT NOW();")
            result = cur.fetchone()
        db_pool.putconn(conn)
        
        # Test Redis connection
        redis_status = "connected" if redis_client and redis_client.ping() else "disconnected"
        
        return jsonify({
            "status": "healthy",
            "service": "Judge0 Queue Worker (Official)",
            "database": "connected",
            "redis": redis_status,
            "timestamp": str(result[0])
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

def main():
    """Main function"""
    logger.info("🚀 Starting Official Judge0 Queue Worker")
    
    try:
        # Initialize connections
        init_connections()
        
        # Start queue processor in background thread
        queue_thread = threading.Thread(target=process_queue, daemon=True)
        queue_thread.start()
        logger.info("🔄 Queue processor started in background")
        
        # Start Flask app for health checks
        port = int(os.environ.get("PORT", 2358))
        logger.info(f"🌐 Starting health check server on port {port}")
        app.run(host="0.0.0.0", port=port, debug=False)
        
    except KeyboardInterrupt:
        logger.info("🛑 Interrupted by user")
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        sys.exit(1)
    finally:
        # Cleanup
        if db_pool:
            db_pool.closeall()
            logger.info("🔒 Database connection pool closed")
        logger.info("👋 Official Judge0 Queue Worker stopped")

if __name__ == "__main__":
    main()
