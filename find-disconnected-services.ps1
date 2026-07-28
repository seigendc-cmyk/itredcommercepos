$ErrorActionPreference = "Stop"

$root = "D:\ICP\itred-commerce-pos"
$src = Join-Path $root "src"
$servicesRoot = Join-Path $src "services"
$reportDir = Join-Path $root "docs\integration-audit"

New-Item -Path $reportDir -ItemType Directory -Force | Out-Null

$sourceFiles = Get-ChildItem `
    -Path $src `
    -Recurse `
    -File `
    -Include "*.ts","*.tsx"

$results = foreach ($serviceFile in Get-ChildItem `
    -Path $servicesRoot `
    -Recurse `
    -File `
    -Filter "*.ts") {

    if ($serviceFile.Name -match "\.test\.ts$") {
        continue
    }

    $moduleName = [System.IO.Path]::GetFileNameWithoutExtension(
        $serviceFile.Name
    )

    $escapedModuleName = [regex]::Escape($moduleName)

    $referenceFiles = @()

    foreach ($sourceFile in $sourceFiles) {
        if ($sourceFile.FullName -eq $serviceFile.FullName) {
            continue
        }

        $content = Get-Content $sourceFile.FullName -Raw

        if (
            $content -match "\b$escapedModuleName\b" -or
            $content -match "from\s+['""][^'""]*$escapedModuleName['""]"
        ) {
            $referenceFiles += $sourceFile.FullName
        }
    }

    $referenceFiles = @(
        $referenceFiles |
        Select-Object -Unique
    )

    [PSCustomObject]@{
        ServiceModule = $moduleName
        File = $serviceFile.FullName
        ReferenceFileCount = $referenceFiles.Count
        Status = if ($referenceFiles.Count -eq 0) {
            "POSSIBLY_DISCONNECTED"
        }
        else {
            "REFERENCED"
        }
        ReferenceFiles = $referenceFiles -join "; "
    }
}

$csvPath = Join-Path $reportDir "service-wiring-audit.csv"
$txtPath = Join-Path $reportDir "service-wiring-audit.txt"

$results |
    Sort-Object Status, ServiceModule |
    Export-Csv `
        -Path $csvPath `
        -NoTypeInformation `
        -Encoding UTF8

$results |
    Sort-Object Status, ServiceModule |
    Format-Table -AutoSize |
    Out-String |
    Set-Content `
        -Path $txtPath `
        -Encoding UTF8

Write-Host "Service audit complete."
Write-Host "CSV: $csvPath"
Write-Host "Text: $txtPath"

Write-Host "`nServices requiring review:"

$results |
    Where-Object {
        $_.Status -eq "POSSIBLY_DISCONNECTED"
    } |
    Format-Table `
        ServiceModule,
        Status,
        ReferenceFileCount `
        -AutoSize
