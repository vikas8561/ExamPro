# Fix for ActiveSupport Logger constant issue
require 'logger'

# Ensure Logger is available before ActiveSupport tries to use it
unless defined?(Logger)
  require 'logger'
end

# Preload ActiveSupport Logger extensions
begin
  require 'active_support/core_ext/logger'
rescue LoadError
  # Ignore if not available
end
