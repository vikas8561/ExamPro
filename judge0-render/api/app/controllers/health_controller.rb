class HealthController < ApplicationController
  def index
    render json: { 
      status: 'healthy', 
      service: 'Judge0 API',
      timestamp: Time.current 
    }
  end
end
