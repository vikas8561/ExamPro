# PowerShell script to verify face-api.js models
# Run this script from the Frontend/public/models directory

Write-Host "Verifying face-api.js models..." -ForegroundColor Green
Write-Host ""

$requiredFiles = @(
    "tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-shard1",
    "face_landmark_68_model-weights_manifest.json",
    "face_landmark_68_model-shard1",
    "face_recognition_model-weights_manifest.json",
    "face_recognition_model-shard1",
    "face_recognition_model-shard2"
)

$allPresent = $true
$expectedSizes = @{
    "tiny_face_detector_model-weights_manifest.json" = 2000
    "tiny_face_detector_model-shard1" = 180000
    "face_landmark_68_model-weights_manifest.json" = 15000
    "face_landmark_68_model-shard1" = 300000
    "face_recognition_model-weights_manifest.json" = 15000
    "face_recognition_model-shard1" = 4000000
    "face_recognition_model-shard2" = 100000
}

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        $fileInfo = Get-Item $file
        $size = $fileInfo.Length
        $expectedSize = $expectedSizes[$file]
        
        if ($size -gt $expectedSize * 0.5) {
            Write-Host "[OK] $file exists ($([math]::Round($size/1KB, 2)) KB)" -ForegroundColor Green
        } else {
            Write-Host "[WARNING] $file exists but size seems incorrect ($([math]::Round($size/1KB, 2)) KB, expected ~$([math]::Round($expectedSize/1KB, 2)) KB)" -ForegroundColor Yellow
            $allPresent = $false
        }
    } else {
        Write-Host "[MISSING] $file" -ForegroundColor Red
        $allPresent = $false
    }
}

Write-Host ""
if ($allPresent) {
    Write-Host "All models are present and appear valid!" -ForegroundColor Green
    Write-Host ""
    Write-Host "If models still fail to load:" -ForegroundColor Cyan
    Write-Host "1. Make sure your dev server is running (npm run dev)" -ForegroundColor Cyan
    Write-Host "2. Check browser console for detailed error messages" -ForegroundColor Cyan
    Write-Host "3. Try accessing http://localhost:5173/models/tiny_face_detector_model-weights_manifest.json in your browser" -ForegroundColor Cyan
    Write-Host "4. If the URL doesn't work, restart your dev server" -ForegroundColor Cyan
} else {
    Write-Host "Some models are missing or corrupted. Please re-download them." -ForegroundColor Red
    Write-Host "Run: .\download-models.ps1" -ForegroundColor Yellow
}

