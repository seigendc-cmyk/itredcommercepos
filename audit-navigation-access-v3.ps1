$ErrorActionPreference = "Stop"

$root = "D:\ICP\itred-commerce-pos"
$appPath = Join-Path $root "src\App.tsx"
$sidebarPath = Join-Path $root "src\components\Sidebar.tsx"
$typesPath = Join-Path $root "src\types\index.ts"
$dbPath = Join-Path $root "src\services\db.ts"
$reportDir = Join-Path $root "docs\integration-audit"

$appContent = Get-Content $appPath -Raw
$sidebarContent = Get-Content $sidebarPath -Raw
$typesContent = Get-Content $typesPath -Raw
$dbContent = Get-Content $dbPath -Raw

New-Item -Path $reportDir -ItemType Directory -Force | Out-Null

$typeMatch = [regex]::Match(
    $typesContent,
    "export\s+type\s+AppMenuId\s*=\s*([\s\S]*?);"
)

if (-not $typeMatch.Success) {
    throw "Could not locate AppMenuId union."
}

$appMenuIds = @(
    [regex]::Matches(
        $typeMatch.Groups[1].Value,
        "['""]([^'""]+)['""]"
    ) |
    ForEach-Object {
        $_.Groups[1].Value
    } |
    Sort-Object -Unique
)

$appRenderIds = @(
    [regex]::Matches(
        $appContent,
        "activeTab\s*===\s*['""]([^'""]+)['""]"
    ) |
    ForEach-Object {
        $_.Groups[1].Value
    } |
    Sort-Object -Unique
)

$sysadminMatch = [regex]::Match(
    $dbContent,
    "sysadmin\s*:\s*\[([\s\S]*?)\]"
)

$sysadminIds = @()

if ($sysadminMatch.Success) {
    $sysadminIds = @(
        [regex]::Matches(
            $sysadminMatch.Groups[1].Value,
            "['""]([^'""]+)['""]"
        ) |
        ForEach-Object {
            $_.Groups[1].Value
        } |
        Sort-Object -Unique
    )
}

$results = foreach ($menuId in $appMenuIds) {
    $inApp = $appRenderIds -contains $menuId

    $inSidebar = $sidebarContent -match (
        "['""]" +
        [regex]::Escape($menuId) +
        "['""]"
    )

    $inSysadmin = $sysadminIds -contains $menuId

    $issues = @()

    if (-not $inApp) {
        $issues += "NO_APP_RENDER_PATH"
    }

    if (-not $inSidebar) {
        $issues += "NOT_REFERENCED_IN_SIDEBAR"
    }

    if (-not $inSysadmin) {
        $issues += "NOT_GRANTED_TO_SYSADMIN"
    }

    [PSCustomObject]@{
        MenuId = $menuId
        InAppRender = $inApp
        InSidebar = $inSidebar
        InSysadminGrant = $inSysadmin
        Status = if ($issues.Count -eq 0) {
            "WIRED"
        }
        else {
            $issues -join "; "
        }
    }
}

$csvPath = Join-Path $reportDir "navigation-access-audit-v3.csv"

$results |
    Sort-Object Status, MenuId |
    Export-Csv `
      -Path $csvPath `
      -NoTypeInformation `
      -Encoding UTF8

Write-Host "Navigation access audit v3 complete."
Write-Host "CSV: $csvPath"

Write-Host "`nItems requiring attention:"

$results |
    Where-Object {
        $_.Status -ne "WIRED"
    } |
    Format-Table -AutoSize
