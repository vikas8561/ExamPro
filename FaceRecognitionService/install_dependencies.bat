@echo off
echo Installing Face Recognition Service Dependencies...
echo.
echo This may take a few minutes...
echo.

pip install --upgrade pip setuptools wheel
pip install flask flask-cors opencv-python numpy Pillow insightface onnxruntime

echo.
echo Installation complete!
echo.
echo If you encounter any errors, try:
echo   pip install --upgrade pip
echo   pip install flask flask-cors opencv-python numpy Pillow insightface onnxruntime
echo.
pause

