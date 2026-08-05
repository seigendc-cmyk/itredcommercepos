# iTredPOS OS Source of Truth

## Purpose

This directory contains the authoritative business, architectural, security and operational rules governing iTredPOS OS.

## Product identity

- Commercial product name: iTred Commerce POS
- Development and codebase name: iTredPOS OS
- Repository: seigendc-cmyk/itredcommercepos
- Architecture: multi-tenant, offline-capable commerce operating system
- Initial release focus: purchasing, receiving, inventory, stocktake, sales, approvals, BI logging, notifications and reporting

## Authority order

When documents conflict, use this precedence:

1. PRODUCT_CHARTER.md
2. MVP_SCOPE.md
3. DOMAIN_INVARIANTS.md
4. ARCHITECTURE_BOUNDARIES.md
5. ROLE_AND_PERMISSION_MATRIX.md
6. Domain SOT documents under docs/sot/domains
7. Technical contracts under docs/sot/contracts
8. Existing implementation
9. UI behaviour

Code and UI do not override an approved SOT rule.

## Agent requirement

Before changing code, an agent must read:

1. MVP_SCOPE.md
2. DOMAIN_INVARIANTS.md
3. ARCHITECTURE_BOUNDARIES.md
4. DEFINITION_OF_DONE.md
5. The domain SOT governing the requested work

Agents must not invent permanent business rules where the SOT is missing, unclear or contradictory.

## Core operational flow

Vendor onboarding
→ warehouse, branch and terminal provisioning
→ supplier and product setup
→ purchasing
→ approval
→ warehouse receiving
→ inventory ledger
→ warehouse-to-branch transfer
→ branch receiving
→ shift opening
→ customer sale
→ payment and receipt
→ stock deduction
→ stocktake and variance control
→ BI events
→ notifications
→ reporting
