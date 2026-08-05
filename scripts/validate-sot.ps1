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
    "docs/sot/domains/PURCHASING.md",
    "docs/sot/domains/SUPPLIER_RECEIVING.md",
    "docs/sot/domains/INVENTORY_LEDGER.md",
    "docs/sot/domains/STOCKTAKE_AND_ADJUSTMENTS.md",
    "docs/sot/domains/SALES_AND_CHECKOUT.md",
    "docs/sot/domains/APPROVAL_WORKFLOWS.md",
    "docs/sot/domains/BI_EVENT_LOGGING.md",
    "docs/sot/domains/NOTIFICATIONS.md",
    "docs/sot/domains/REPORTING.md",
    "docs/sot/contracts/ACCEPTANCE_TEST_MATRIX.md"
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
