require 'sinatra'
require 'sinatra/cors'
require 'pg'
require 'json'
require 'redis'

# Configure CORS
register Sinatra::Cors
set :allow_origin, "*"
set :allow_methods, "GET,HEAD,POST,PUT,DELETE,OPTIONS"
set :allow_headers, "content-type,if-modified-since,allow,authorization,x-requested-with"

# Database connection
def db_connection
  @db_connection ||= PG.connect(ENV['DATABASE_URL'])
end

# Redis connection
def redis_connection
  @redis_connection ||= Redis.new(url: ENV['REDIS_URL'])
end

# Health check
get '/' do
  content_type :json
  { 
    status: 'healthy', 
    service: 'Judge0 API',
    timestamp: Time.now.iso8601 
  }.to_json
end

# Get supported languages
get '/api/v1/languages' do
  content_type :json
  languages = [
    { id: 50, name: "C (GCC 9.2.0)" },
    { id: 54, name: "C++ (GCC 9.2.0)" },
    { id: 51, name: "C# (Mono 6.6.0.161)" },
    { id: 60, name: "Go (1.13.5)" },
    { id: 62, name: "Java (OpenJDK 13.0.1)" },
    { id: 63, name: "JavaScript (Node.js 12.14.0)" },
    { id: 71, name: "Python (3.8.1)" },
    { id: 74, name: "TypeScript (3.7.4)" }
  ]
  languages.to_json
end

# Create submission
post '/api/v1/submissions' do
  content_type :json
  
  begin
    data = JSON.parse(request.body.read)
    
    # Validate required fields
    unless data['source_code'] && data['language_id']
      status 400
      return { error: 'Missing required fields: source_code, language_id' }.to_json
    end
    
    # Insert submission
    result = db_connection.exec_params(
      "INSERT INTO submissions (source_code, language_id, stdin, expected_output, status, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id",
      [data['source_code'], data['language_id'], data['stdin'] || '', data['expected_output'] || '', 'In Queue']
    )
    
    submission_id = result[0]['id']
    
    # Queue for processing
    redis_connection.lpush('submission_queue', submission_id)
    
    { id: submission_id, status: 'In Queue' }.to_json
    
  rescue JSON::ParserError
    status 400
    { error: 'Invalid JSON' }.to_json
  rescue => e
    status 500
    { error: e.message }.to_json
  end
end

# Get submission result
get '/api/v1/submissions/:id' do
  content_type :json
  
  begin
    result = db_connection.exec_params(
      "SELECT id, source_code, language_id, stdin, expected_output, stdout, stderr, 
              compile_output, message, time, memory, status, created_at 
       FROM submissions WHERE id = $1",
      [params['id']]
    )
    
    if result.ntuples == 0
      status 404
      return { error: 'Submission not found' }.to_json
    end
    
    submission = result[0]
    {
      id: submission['id'].to_i,
      source_code: submission['source_code'],
      language_id: submission['language_id'].to_i,
      stdin: submission['stdin'],
      expected_output: submission['expected_output'],
      stdout: submission['stdout'],
      stderr: submission['stderr'],
      compile_output: submission['compile_output'],
      message: submission['message'],
      time: submission['time'],
      memory: submission['memory'],
      status: submission['status']
    }.to_json
    
  rescue => e
    status 500
    { error: e.message }.to_json
  end
end

# Get all submissions
get '/api/v1/submissions' do
  content_type :json
  
  begin
    result = db_connection.exec(
      "SELECT id, source_code, language_id, stdin, expected_output, stdout, stderr, 
              compile_output, message, time, memory, status, created_at 
       FROM submissions ORDER BY created_at DESC LIMIT 100"
    )
    
    submissions = result.map do |row|
      {
        id: row['id'].to_i,
        source_code: row['source_code'],
        language_id: row['language_id'].to_i,
        stdin: row['stdin'],
        expected_output: row['expected_output'],
        stdout: row['stdout'],
        stderr: row['stderr'],
        compile_output: row['compile_output'],
        message: row['message'],
        time: row['time'],
        memory: row['memory'],
        status: row['status']
      }
    end
    
    submissions.to_json
    
  rescue => e
    status 500
    { error: e.message }.to_json
  end
end

# Initialize database tables
def init_database
  begin
    # Create submissions table
    db_connection.exec(<<~SQL)
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        source_code TEXT NOT NULL,
        language_id INTEGER NOT NULL,
        stdin TEXT DEFAULT '',
        expected_output TEXT DEFAULT '',
        stdout TEXT DEFAULT '',
        stderr TEXT DEFAULT '',
        compile_output TEXT DEFAULT '',
        message TEXT DEFAULT '',
        time DECIMAL(10,3) DEFAULT NULL,
        memory INTEGER DEFAULT NULL,
        status VARCHAR(20) DEFAULT 'In Queue',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    SQL
    
    # Create languages table
    db_connection.exec(<<~SQL)
      CREATE TABLE IF NOT EXISTS languages (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    SQL
    
    # Insert supported languages
    db_connection.exec(<<~SQL)
      INSERT INTO languages (id, name, version) VALUES
      (50, 'C (GCC 9.2.0)', '9.2.0'),
      (54, 'C++ (GCC 9.2.0)', '9.2.0'),
      (51, 'C# (Mono 6.6.0.161)', '6.6.0.161'),
      (60, 'Go (1.13.5)', '1.13.5'),
      (62, 'Java (OpenJDK 13.0.1)', '13.0.1'),
      (63, 'JavaScript (Node.js 12.14.0)', '12.14.0'),
      (71, 'Python (3.8.1)', '3.8.1'),
      (74, 'TypeScript (3.7.4)', '3.7.4')
      ON CONFLICT (id) DO NOTHING;
    SQL
    
    puts "Database initialized successfully"
  rescue => e
    puts "Database initialization failed: #{e.message}"
  end
end

# Initialize database on startup
init_database

# Start the server
if __FILE__ == $0
  port = ENV['PORT'] || 2358
  puts "Starting Judge0 API on port #{port}"
  set :port, port
  set :bind, '0.0.0.0'
end
