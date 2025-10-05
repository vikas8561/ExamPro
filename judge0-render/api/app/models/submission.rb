class Submission < ApplicationRecord
  validates :source_code, presence: true
  validates :language_id, presence: true, numericality: { only_integer: true }
  
  belongs_to :language, optional: true
  
  scope :recent, -> { order(created_at: :desc) }
  scope :by_status, ->(status) { where(status: status) }
  
  def processing?
    status == 'Processing'
  end
  
  def completed?
    ['Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Compilation Error'].include?(status)
  end
  
  def failed?
    ['Compilation Error', 'Runtime Error', 'Time Limit Exceeded'].include?(status)
  end
end
