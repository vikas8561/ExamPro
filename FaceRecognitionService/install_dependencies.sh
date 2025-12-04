#!/bin/bash

echo "Installing Face Recognition Service Dependencies..."
echo ""
echo "This may take a few minutes..."
echo ""

pip install --upgrade pip setuptools wheel
pip install flask flask-cors opencv-python numpy Pillow insightface onnxruntime

echo ""
echo "Installation complete!"
echo ""

