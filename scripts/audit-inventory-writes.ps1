param([string]$RootPath = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $RootPath).Path
$sourceRoot = Join-Path $root 'src'
$collections = 'warehouse_inventory|branch_inventory|inventory_balances|inventory_balance'
$writes = 'setDoc|updateDoc|addDoc|transaction\.(set|update)|batch\.(set|update)'
$quantities = '(quantity|onHandQty|reservedQty|inTransitQty|quarantinedQty|damagedQty)\s*:'
$approvedPaths = '^src/features/inventory/(infrastructure|tests)/|^src/.*/(__tests__|fixtures)/|^src/migrations/'
$findings = @()

if (-not (Test-Path $sourceRoot)) { Write-Error "Missing source directory: $sourceRoot"; exit 2 }
Get-ChildItem $sourceRoot -Recurse -File -Include *.ts,*.tsx | ForEach-Object {
  $relative = $_.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  $lines = @(Get-Content $_.FullName)
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $first = [Math]::Max(0, $i - 40)
    $last = [Math]::Min($lines.Count - 1, $i + 40)
    $context = $lines[$first..$last] -join "`n"
    $wideFirst = [Math]::Max(0, $i - 80)
    $wideLast = [Math]::Min($lines.Count - 1, $i + 80)
    $writeContext = $lines[$wideFirst..$wideLast] -join "`n"
    $collectionWrite = ($lines[$i] -match $collections) -and ($writeContext -match $writes)
    $quantityWrite = ($lines[$i] -match $quantities) -and ($context -match $collections) -and ($context -match $writes)
    if (-not ($collectionWrite -or $quantityWrite)) { continue }
    $approved = $relative -eq 'src/services/db.ts' -or $relative -match $approvedPaths
    if ($relative -eq 'src/services/db.ts') { $classification = 'LEGACY_REQUIRES_MIGRATION' }
    elseif ($approved) { $classification = 'APPROVED_BOUNDARY_WRITE' }
    else { $classification = 'PROHIBITED_DIRECT_WRITE' }
    $findings += [pscustomobject]@{ File=$relative; Line=$i+1; Classification=$classification; Approved=$approved; Match=$lines[$i].Trim() }
  }
}

$findings = @($findings | Sort-Object File,Line -Unique)
if ($findings.Count -eq 0) { Write-Output 'No direct inventory balance writes found.' }
else { $findings | Format-Table File,Line,Classification,Approved,Match -Wrap -AutoSize | Out-String -Width 240 | Write-Output }
$prohibited = @($findings | Where-Object { -not $_.Approved })
Write-Output ("Inventory write audit: {0} finding(s), {1} prohibited." -f $findings.Count, $prohibited.Count)
if ($prohibited.Count -gt 0) { exit 1 }
