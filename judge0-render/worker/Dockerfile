# Simple Judge0 Worker using official image
FROM judge0/judge0:1.13.0

# Copy worker files to a safe location
COPY . /opt/worker/

# Install Python dependencies
RUN pip3 install -r /opt/worker/requirements.txt

# Start worker from the copied location
CMD ["python3", "/opt/worker/queue_worker_official.py"]