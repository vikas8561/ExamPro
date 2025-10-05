class ApplicationController < ActionController::API
  include ActionController::MimeResponds
  
  def not_found
    render json: { error: 'Not Found' }, status: :not_found
  end
end
