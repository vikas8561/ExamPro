ENV['BUNDLE_GEMFILE'] ||= File.expand_path('../Gemfile', __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.

# Ensure Logger is properly loaded before ActiveSupport
begin
  require "logger"
  require "active_support/core_ext/logger"
rescue LoadError
  # Fallback if extensions aren't available
end

require "bootsnap/setup" # Speed up boot time by caching expensive operations.
