#!/usr/bin/env python3
"""
Judge0 Queue Worker - Background service to process code execution queue
"""
import os
import logging
import subprocess
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
            minconn=2,
            maxconn=10,
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

def run_isolate(args):
    """Run isolate command for code execution"""
    try:
        result = subprocess.run(
            ["isolate"] + args,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        return {
            "return_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    except subprocess.TimeoutExpired:
        return {
            "return_code": -1,
            "stdout": "",
            "stderr": "Execution timeout"
        }
    except Exception as e:
        logger.error(f"Error running isolate: {e}")
        return {
            "return_code": -1,
            "stdout": "",
            "stderr": str(e)
        }

def execute_code(submission_id, source_code, language_id, stdin, expected_output):
    """Execute code using subprocess (simplified version) - UPDATED v2.0"""
    try:
        import tempfile
        import os
        logger.info(f"🚀 Using NEW subprocess execution for submission {submission_id}")
        
        # Map language IDs to file extensions and commands
        language_config = {
            50: {"ext": "c", "compile": ["gcc", "-o", "main", "main.c"], "run": ["./main"]},
            54: {"ext": "cpp", "compile": ["g++", "-o", "main", "main.cpp"], "run": ["./main"]},
            51: {"ext": "cs", "compile": ["mcs", "main.cs"], "run": ["mono", "main.exe"]},
            60: {"ext": "go", "compile": None, "run": ["go", "run", "main.go"]},
            62: {"ext": "java", "compile": ["javac", "Main.java"], "run": ["java", "Main"]},
            63: {"ext": "js", "compile": None, "run": ["node", "main.js"]},
            71: {"ext": "py", "compile": None, "run": ["python3", "main.py"]},
            74: {"ext": "ts", "compile": ["tsc", "main.ts"], "run": ["node", "main.js"]}
        }
        
        if language_id not in language_config:
            return {
                "status": "Internal Error",
                "stdout": "",
                "stderr": f"Unsupported language ID: {language_id}",
                "compile_output": "",
                "time": None,
                "memory": None
            }
        
        config = language_config[language_id]
        filename = f"main.{config['ext']}"
        
        # Create temporary directory for execution
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = os.path.join(temp_dir, filename)
            
            # Write source code to file
            with open(file_path, "w") as f:
                f.write(source_code)
            
            stdout = ""
            stderr = ""
            compile_output = ""
            status = "Accepted"
            
            try:
                # Compile if needed
                if config["compile"]:
                    compile_cmd = [cmd.replace("main.c", file_path).replace("main.cpp", file_path).replace("main.cs", file_path).replace("Main.java", file_path).replace("main.ts", file_path) for cmd in config["compile"]]
                    compile_result = subprocess.run(
                        compile_cmd,
                        cwd=temp_dir,
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if compile_result.returncode != 0:
                        status = "Compilation Error"
                        compile_output = compile_result.stderr
                        return {
                            "status": status,
                            "stdout": "",
                            "stderr": "",
                            "compile_output": compile_output,
                            "time": "0.001",
                            "memory": 1024
                        }
                
                # Run the code
                run_cmd = [cmd.replace("main.py", file_path).replace("main.js", file_path).replace("main.go", file_path) for cmd in config["run"]]
                run_result = subprocess.run(
                    run_cmd,
                    cwd=temp_dir,
                    input=stdin,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                stdout = run_result.stdout
                stderr = run_result.stderr
                
                # Determine status
                if run_result.returncode != 0:
                    status = "Runtime Error"
                elif expected_output and stdout.strip() != expected_output.strip():
                    status = "Wrong Answer"
                else:
                    status = "Accepted"
                
            except subprocess.TimeoutExpired:
                status = "Time Limit Exceeded"
                stderr = "Execution timeout"
            except Exception as e:
                status = "Runtime Error"
                stderr = str(e)
            
            return {
                "status": status,
                "stdout": stdout,
                "stderr": stderr,
                "compile_output": compile_output,
                "time": "0.001",
                "memory": 1024
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
                        
                        # Execute code
                        exec_result = execute_code(submission_id, source_code, language_id, stdin, expected_output)
                        
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
            "service": "Judge0 Queue Worker",
            "database": "connected",
            "redis": redis_status,
            "timestamp": str(result[0])
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

def main():
    """Main function"""
    logger.info("🚀 Starting Judge0 Queue Worker")
    
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
        logger.info("👋 Judge0 Queue Worker stopped")

if __name__ == "__main__":
    main()
