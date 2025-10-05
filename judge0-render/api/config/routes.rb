Rails.application.routes.draw do
  # Health check
  get '/', to: 'health#index'
  
  # API routes
  namespace :api do
    namespace :v1 do
      resources :submissions, only: [:create, :show, :index]
      resources :languages, only: [:index]
    end
  end
  
  # Fallback for any unmatched routes
  match '*path', to: 'application#not_found', via: :all
end
