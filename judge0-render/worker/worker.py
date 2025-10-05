import os
import logging
import subprocess
import json
import time
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
    logger.info(f"🚀 Starting Judge0 Worker on 0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)