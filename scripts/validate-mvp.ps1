$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies..."
npm ci

Write-Host "Running TypeScript checks..."
npm run lint

Write-Host "Building application..."
npm run build

Write-Host "MVP validation completed successfully."
