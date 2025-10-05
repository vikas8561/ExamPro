class Api::V1::SubmissionsController < ApplicationController
  before_action :set_submission, only: [:show]

  def index
    @submissions = Submission.order(created_at: :desc).limit(100)
    render json: @submissions
  end

  def create
    @submission = Submission.new(submission_params)
    
    if @submission.save
      # Queue for processing
      ProcessSubmissionJob.perform_later(@submission.id)
      render json: @submission, status: :created
    else
      render json: { errors: @submission.errors }, status: :unprocessable_entity
    end
  end

  def show
    render json: @submission
  end

  private

  def set_submission
    @submission = Submission.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Submission not found' }, status: :not_found
  end

  def submission_params
    params.require(:submission).permit(:source_code, :language_id, :stdin, :expected_output)
  end
end
