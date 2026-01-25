# PowerShell script to download face-api.js models from CDN (more reliable)
# Run this script from the Frontend/public/models directory

Write-Host "Downloading face-api.js models from CDN..." -ForegroundColor Green

# Using jsdelivr CDN which is more reliable than raw.githubusercontent.com
$baseUrl = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights"
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
    $attempts = 0
    $maxAttempts = 3
    $success = $false
    
    while ($attempts -lt $maxAttempts -and -not $success) {
        $attempts++
        try {
            $response = Invoke-WebRequest -Uri $url -OutFile $file -ErrorAction Stop
            $fileInfo = Get-Item $file
            if ($fileInfo.Length -gt 0) {
                Write-Host "[OK] $file downloaded successfully ($([math]::Round($fileInfo.Length/1KB, 2)) KB)" -ForegroundColor Green
                $success = $true
            } else {
                Write-Host "[WARNING] $file is empty, retrying..." -ForegroundColor Yellow
                Remove-Item $file -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Host "[ERROR] Attempt $attempts failed: $_" -ForegroundColor Red
            if ($attempts -lt $maxAttempts) {
                Start-Sleep -Seconds 2
            }
        }
    }
    
    if (-not $success) {
        Write-Host "[FATAL] Failed to download $file after $maxAttempts attempts" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Download complete!" -ForegroundColor Green
Write-Host "Verifying file sizes..." -ForegroundColor Cyan

# Verify critical files
$criticalFiles = @{
    "face_recognition_model-shard1" = 4000000  # ~4MB
    "face_recognition_model-shard2" = 100000   # ~100KB
}

foreach ($file in $criticalFiles.Keys) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        $expected = $criticalFiles[$file]
        if ($size -gt $expected * 0.9) {
            Write-Host "[OK] $file size verified: $([math]::Round($size/1KB, 2)) KB" -ForegroundColor Green
        } else {
            Write-Host "[WARNING] $file size seems incorrect: $([math]::Round($size/1KB, 2)) KB (expected ~$([math]::Round($expected/1KB, 2)) KB)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[ERROR] $file is missing!" -ForegroundColor Red
    }
}

