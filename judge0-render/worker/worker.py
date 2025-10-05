import os
import logging
import subprocess
import json
import time
import threading
from flask import Flask, request, jsonify
from psycopg2 import pool
import redis

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Flask app
app = Flask(__name__)

# Database connection
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    logger.error("DATABASE_URL environment variable not set")
    raise RuntimeError("DATABASE_URL environment variable not set")

try:
    db_pool = pool.SimpleConnectionPool(
        minconn=5,
        maxconn=20,
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

# Graceful shutdown
import atexit
@atexit.register
def close_pool():
    if db_pool:
        db_pool.closeall()
        logger.info("🔒 Database connection pool closed")

def run_isolate(args):
    """Run isolate command for code execution"""
    try:
        # Ensure /box directory exists
        os.makedirs("/box", exist_ok=True)
        
        # Run isolate command
        result = subprocess.run(
            ["isolate"] + args,
            capture_output=True,
            text=True,
            timeout=30,
            cwd="/box"
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
    """Execute code using isolate"""
    try:
        # Map language IDs to file extensions and commands
        language_config = {
            50: {"ext": "c", "cmd": ["gcc", "-o", "main", "main.c", "&&", "./main"]},
            54: {"ext": "cpp", "cmd": ["g++", "-o", "main", "main.cpp", "&&", "./main"]},
            51: {"ext": "cs", "cmd": ["mcs", "main.cs", "&&", "mono", "main.exe"]},
            60: {"ext": "go", "cmd": ["go", "run", "main.go"]},
            62: {"ext": "java", "cmd": ["javac", "Main.java", "&&", "java", "Main"]},
            63: {"ext": "js", "cmd": ["node", "main.js"]},
            71: {"ext": "py", "cmd": ["python3", "main.py"]},
            74: {"ext": "ts", "cmd": ["tsc", "main.ts", "&&", "node", "main.js"]}
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
        
        # Create isolate environment
        isolate_result = run_isolate(["--init"])
        if isolate_result["return_code"] != 0:
            return {
                "status": "Internal Error",
                "stdout": "",
                "stderr": f"Failed to initialize isolate: {isolate_result['stderr']}",
                "compile_output": "",
                "time": None,
                "memory": None
            }
        
        box_id = isolate_result["stdout"].strip()
        
        try:
            # Write source code to file
            with open(f"/tmp/isolate/{box_id}/box/{filename}", "w") as f:
                f.write(source_code)
            
            # Write input to stdin file
            with open(f"/tmp/isolate/{box_id}/box/stdin", "w") as f:
                f.write(stdin)
            
            # Execute code
            cmd = ["--run", f"--box-id={box_id}"] + config["cmd"]
            exec_result = run_isolate(cmd)
            
            # Read output files
            stdout = ""
            stderr = ""
            compile_output = ""
            
            try:
                with open(f"/tmp/isolate/{box_id}/box/stdout", "r") as f:
                    stdout = f.read()
            except:
                pass
            
            try:
                with open(f"/tmp/isolate/{box_id}/box/stderr", "r") as f:
                    stderr = f.read()
            except:
                pass
            
            # Determine status
            if exec_result["return_code"] == 0:
                if expected_output and stdout.strip() != expected_output.strip():
                    status = "Wrong Answer"
                else:
                    status = "Accepted"
            else:
                if "compilation" in stderr.lower() or "error" in stderr.lower():
                    status = "Compilation Error"
                    compile_output = stderr
                    stderr = ""
                else:
                    status = "Runtime Error"
            
            return {
                "status": status,
                "stdout": stdout,
                "stderr": stderr,
                "compile_output": compile_output,
                "time": "0.001",  # Placeholder
                "memory": 1024    # Placeholder
            }
            
        finally:
            # Clean up isolate environment
            run_isolate(["--cleanup", f"--box-id={box_id}"])
            
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
    
    while True:
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
            "database": "connected",
            "redis": redis_status,
            "timestamp": str(result[0])
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

@app.route("/submissions", methods=["POST"])
def create_submission():
    """Create a new code submission"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ["source_code", "language_id"]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        
        # Store submission in database
        conn = db_pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO submissions (source_code, language_id, stdin, expected_output, created_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    RETURNING id
                """, (
                    data["source_code"],
                    data["language_id"],
                    data.get("stdin", ""),
                    data.get("expected_output", "")
                ))
                submission_id = cur.fetchone()[0]
                conn.commit()
                
                # Queue for processing
                if redis_client:
                    redis_client.lpush("submission_queue", submission_id)
                
                return jsonify({
                    "id": submission_id,
                    "status": "In Queue"
                })
        finally:
            db_pool.putconn(conn)
            
    except Exception as e:
        logger.error(f"Error creating submission: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/submissions/<int:submission_id>", methods=["GET"])
def get_submission(submission_id):
    """Get submission result"""
    try:
        conn = db_pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, source_code, language_id, stdin, expected_output,
                           stdout, stderr, compile_output, message, time, memory, status
                    FROM submissions WHERE id = %s
                """, (submission_id,))
                result = cur.fetchone()
                
                if not result:
                    return jsonify({"error": "Submission not found"}), 404
                
                return jsonify({
                    "id": result[0],
                    "source_code": result[1],
                    "language_id": result[2],
                    "stdin": result[3],
                    "expected_output": result[4],
                    "stdout": result[5],
                    "stderr": result[6],
                    "compile_output": result[7],
                    "message": result[8],
                    "time": result[9],
                    "memory": result[10],
                    "status": result[11]
                })
        finally:
            db_pool.putconn(conn)
            
    except Exception as e:
        logger.error(f"Error getting submission: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/languages", methods=["GET"])
def get_languages():
    """Get supported programming languages"""
    languages = [
        {"id": 50, "name": "C (GCC 9.2.0)"},
        {"id": 54, "name": "C++ (GCC 9.2.0)"},
        {"id": 51, "name": "C# (Mono 6.6.0.161)"},
        {"id": 60, "name": "Go (1.13.5)"},
        {"id": 62, "name": "Java (OpenJDK 13.0.1)"},
        {"id": 63, "name": "JavaScript (Node.js 12.14.0)"},
        {"id": 71, "name": "Python (3.8.1)"},
        {"id": 74, "name": "TypeScript (3.7.4)"}
    ]
    return jsonify(languages)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 2358))
    
    # Start queue processor in background thread
    queue_thread = threading.Thread(target=process_queue, daemon=True)
    queue_thread.start()
    
    logger.info(f"🚀 Starting Judge0 Worker on 0.0.0.0:{port}")
    logger.info("🔄 Queue processor started in background")
    app.run(host="0.0.0.0", port=port, debug=False)