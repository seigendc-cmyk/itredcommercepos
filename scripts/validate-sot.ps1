$ErrorActionPreference = "Stop"

$RequiredFiles = @(
    "docs/sot/README.md",
    "docs/sot/PRODUCT_CHARTER.md",
    "docs/sot/MVP_SCOPE.md",
    "docs/sot/DOMAIN_INVARIANTS.md",
    "docs/sot/ARCHITECTURE_BOUNDARIES.md",
    "docs/sot/ROLE_AND_PERMISSION_MATRIX.md",
    "docs/sot/EVENT_AND_AUDIT_STANDARD.md",
    "docs/sot/DEFINITION_OF_DONE.md",
    "docs/sot/AGENT_EXECUTION_RULES.md",
    "docs/sot/BRANCH_AND_RELEASE_RULES.md",
    "docs/sot/domains/TENANCY_AND_ONBOARDING.md",
    "docs/sot/domains/ORGANISATION_STRUCTURE.md",
    "docs/sot/domains/PURCHASING.md",
    "docs/sot/domains/SUPPLIER_RECEIVING.md",
    "docs/sot/domains/INVENTORY_LEDGER.md",
    "docs/sot/domains/STOCKTAKE_AND_ADJUSTMENTS.md",
    "docs/sot/domains/SHIFT_AND_CASH_CONTROL.md",
    "docs/sot/domains/SALES_AND_CHECKOUT.md",
    "docs/sot/domains/PAYMENTS_AND_RECEIPTS.md",
    "docs/sot/domains/RETURNS_VOIDS_AND_REFUNDS.md",
    "docs/sot/domains/APPROVAL_WORKFLOWS.md",
    "docs/sot/domains/BI_EVENT_LOGGING.md",
    "docs/sot/domains/NOTIFICATIONS.md",
    "docs/sot/domains/REPORTING.md",
    "docs/sot/contracts/STATE_MACHINES.md",
    "docs/sot/contracts/ACCEPTANCE_TEST_MATRIX.md"
)

$MinimumLengthByFile = @{
    "docs/sot/domains/TENANCY_AND_ONBOARDING.md"    = 1500
    "docs/sot/domains/ORGANISATION_STRUCTURE.md"    = 1200
    "docs/sot/domains/PURCHASING.md"                = 1500
    "docs/sot/domains/SUPPLIER_RECEIVING.md"        = 1500
    "docs/sot/domains/INVENTORY_LEDGER.md"          = 1500
    "docs/sot/domains/STOCKTAKE_AND_ADJUSTMENTS.md" = 2000
    "docs/sot/domains/SHIFT_AND_CASH_CONTROL.md"     = 1500
    "docs/sot/domains/SALES_AND_CHECKOUT.md"        = 2000
    "docs/sot/domains/PAYMENTS_AND_RECEIPTS.md"     = 1200
    "docs/sot/domains/RETURNS_VOIDS_AND_REFUNDS.md" = 1200
    "docs/sot/domains/APPROVAL_WORKFLOWS.md"        = 1800
    "docs/sot/domains/BI_EVENT_LOGGING.md"          = 1800
    "docs/sot/domains/NOTIFICATIONS.md"             = 1500
    "docs/sot/domains/REPORTING.md"                 = 1800
    "docs/sot/contracts/STATE_MACHINES.md"          = 1200
    "docs/sot/contracts/ACCEPTANCE_TEST_MATRIX.md"  = 1500
}

$PlaceholderPatterns = @(
    "^Define vendor lifecycle",
    "^Define purchase requisitions",
    "^Define supplier",
    "^Define append-only",
    "^Define full counts",
    "^Define branch-scoped",
    "^Define shared approval",
    "^Define tenant-isolated",
    "^Define event-driven",
    "^Define report sources",
    "^Define warehouses",
    "^Define payment methods",
    "^Define controlled corrections",
    "^Define shift opening"
)

$Errors = @()

foreach ($File in $RequiredFiles) {
    if (-not (Test-Path $File)) {
        $Errors += "Missing required SOT file: $File"
        continue
    }

    $Content = Get-Content -Path $File -Raw

    if ([string]::IsNullOrWhiteSpace($Content)) {
        $Errors += "Required SOT file is empty: $File"
        continue
    }

    if (
        $MinimumLengthByFile.ContainsKey($File) -and
        $Content.Length -lt $MinimumLengthByFile[$File]
    ) {
        $Errors += (
            "SOT file appears incomplete: {0} has {1} characters; minimum expected is {2}" -f
            $File,
            $Content.Length,
            $MinimumLengthByFile[$File]
        )
    }

    foreach ($Pattern in $PlaceholderPatterns) {
        if ($Content -match $Pattern) {
            $Errors += "Placeholder content detected in: $File"
            break
        }
    }
}

if ($Errors.Count -gt 0) {
    Write-Host ""
    Write-Host "SOT validation failed:" -ForegroundColor Red

    foreach ($ErrorMessage in $Errors) {
        Write-Host " - $ErrorMessage" -ForegroundColor Red
    }

    exit 1
}

Write-Host ""
Write-Host "SOT validation passed." -ForegroundColor Green
Write-Host "Validated $($RequiredFiles.Count) required documents."
