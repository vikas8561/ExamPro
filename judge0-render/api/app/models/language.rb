class Language < ApplicationRecord
  has_many :submissions, dependent: :destroy
  
  validates :name, presence: true
  validates :id, presence: true, uniqueness: true
end
