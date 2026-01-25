# PowerShell script to download face-api.js models
# Run this script from the Frontend/public/models directory

Write-Host "Downloading face-api.js models..." -ForegroundColor Green

$baseUrl = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
$files = @(
    "tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-shard1",
    "face_landmark_68_model-weights_manifest.json",
    "face_landmark_68_model-shard1",
    "face_recognition_model-weights_manifest.json",
    "face_recognition_model-shard1",
    "face_recognition_model-shard2"
)

foreach ($file in $files) {
    $url = "$baseUrl/$file"
    Write-Host "Downloading $file..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $url -OutFile $file
        Write-Host "[OK] $file downloaded successfully" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to download $file : $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Download complete!" -ForegroundColor Green
Write-Host "All models should now be in the current directory." -ForegroundColor Cyan

