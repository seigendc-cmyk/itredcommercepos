$ErrorActionPreference = "Stop"

$root = "D:\ICP\itred-commerce-pos"
$src = Join-Path $root "src"
$componentsRoot = Join-Path $src "components"
$reportDir = Join-Path $root "docs\integration-audit"

New-Item -Path $reportDir -ItemType Directory -Force | Out-Null

$sourceFiles = Get-ChildItem `
    -Path $src `
    -Recurse `
    -File `
    -Include "*.ts","*.tsx"

$results = foreach ($component in Get-ChildItem `
    -Path $componentsRoot `
    -Recurse `
    -File `
    -Filter "*.tsx") {

    $componentName = [System.IO.Path]::GetFileNameWithoutExtension(
        $component.Name
    )

    $escapedName = [regex]::Escape($componentName)

    $allReferences = @()
    $importReferences = @()
    $renderReferences = @()
    $lazyReferences = @()

    foreach ($file in $sourceFiles) {
        if ($file.FullName -eq $component.FullName) {
            continue
        }

        $content = Get-Content $file.FullName -Raw

        if ($content -match "\b$escapedName\b") {
            $allReferences += $file.FullName
        }

        if (
            $content -match "(?m)^\s*import[\s\S]*?\b$escapedName\b[\s\S]*?from\s+['""]"
        ) {
            $importReferences += $file.FullName
        }

        if (
            $content -match "<\s*$escapedName(\s|/|>)"
        ) {
            $renderReferences += $file.FullName
        }

        if (
            $content -match "React\.createElement\(\s*$escapedName\b"
        ) {
            $renderReferences += $file.FullName
        }

        if (
            $content -match "lazy\s*\([\s\S]*?$escapedName"
        ) {
            $lazyReferences += $file.FullName
        }
    }

    $allReferences = @(
        $allReferences |
        Select-Object -Unique
    )

    $importReferences = @(
        $importReferences |
        Select-Object -Unique
    )

    $renderReferences = @(
        $renderReferences |
        Select-Object -Unique
    )

    $lazyReferences = @(
        $lazyReferences |
        Select-Object -Unique
    )

    $status = if ($renderReferences.Count -gt 0) {
        "RENDERED"
    }
    elseif ($lazyReferences.Count -gt 0) {
        "LAZY_LOADED"
    }
    elseif ($importReferences.Count -gt 0) {
        "IMPORTED_NOT_RENDERED"
    }
    elseif ($allReferences.Count -gt 0) {
        "REFERENCED_INDIRECTLY"
    }
    else {
        "POSSIBLY_DISCONNECTED"
    }

    [PSCustomObject]@{
        Component = $componentName
        File = $component.FullName
        Status = $status
        TotalReferenceFiles = $allReferences.Count
        ImportReferenceFiles = $importReferences.Count
        RenderReferenceFiles = $renderReferences.Count
        LazyReferenceFiles = $lazyReferences.Count
        ReferenceFiles = $allReferences -join "; "
    }
}

$csvPath = Join-Path $reportDir "component-wiring-audit-v2.csv"
$txtPath = Join-Path $reportDir "component-wiring-audit-v2.txt"

$results |
    Sort-Object Status, Component |
    Export-Csv `
        -Path $csvPath `
        -NoTypeInformation `
        -Encoding UTF8

$results |
    Sort-Object Status, Component |
    Format-Table -AutoSize |
    Out-String |
    Set-Content `
        -Path $txtPath `
        -Encoding UTF8

Write-Host "Improved component audit complete."
Write-Host "CSV: $csvPath"
Write-Host "Text: $txtPath"

Write-Host "`nComponents requiring review:"

$results |
    Where-Object {
        $_.Status -in @(
            "POSSIBLY_DISCONNECTED",
            "IMPORTED_NOT_RENDERED"
        )
    } |
    Format-Table `
        Component,
        Status,
        TotalReferenceFiles,
        ImportReferenceFiles,
        RenderReferenceFiles `
        -AutoSize
