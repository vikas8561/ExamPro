-- Judge0 Database Schema
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

CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert supported languages
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_language_id ON submissions(language_id);
