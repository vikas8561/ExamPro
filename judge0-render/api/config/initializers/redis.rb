# Redis client (avoid deprecated Redis.current)
REDIS = Redis.new(url: ENV['REDIS_URL'] || 'redis://localhost:6379')
