$ErrorActionPreference = "Stop"

$root = "D:\ICP\itred-commerce-pos"
$src = Join-Path $root "src"
$reportDir = Join-Path $root "docs\integration-audit"

$patterns = @(
    "grantedMenuIds",
    "includes\(activeTab",
    "includes\(['""]",
    "defaultGrantedMenuIds",
    "AppMenuId",
    "setActiveTab"
)

$results = Get-ChildItem `
    -Path $src `
    -Recurse `
    -Include "*.ts","*.tsx" |
    Select-String `
        -Pattern $patterns |
    Select-Object `
        Path,
        LineNumber,
        Line

$results |
    Export-Csv `
        -Path "$reportDir\menu-permission-audit.csv" `
        -NoTypeInformation `
        -Encoding UTF8

$results |
    Format-Table -AutoSize |
    Out-String |
    Set-Content `
        -Path "$reportDir\menu-permission-audit.txt" `
        -Encoding UTF8

Write-Host "Menu permission audit complete."
Write-Host "CSV: $reportDir\menu-permission-audit.csv"
