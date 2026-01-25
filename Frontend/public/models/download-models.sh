#!/bin/bash
# Bash script to download face-api.js models
# Run this script from the Frontend/public/models directory

echo "Downloading face-api.js models..."

BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
FILES=(
    "tiny_face_detector_model-weights_manifest.json"
    "tiny_face_detector_model-shard1"
    "face_landmark_68_model-weights_manifest.json"
    "face_landmark_68_model-shard1"
    "face_recognition_model-weights_manifest.json"
    "face_recognition_model-shard1"
)

for file in "${FILES[@]}"; do
    echo "Downloading $file..."
    curl -L -o "$file" "$BASE_URL/$file"
    if [ $? -eq 0 ]; then
        echo "✓ $file downloaded successfully"
    else
        echo "✗ Failed to download $file"
    fi
done

echo ""
echo "Download complete!"
echo "All models should now be in the current directory."

