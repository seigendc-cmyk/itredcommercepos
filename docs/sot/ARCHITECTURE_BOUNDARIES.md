# Architecture Boundaries

## Trusted authority

The client UI is not an authority for:

- tenant membership;
- permissions;
- approval eligibility;
- inventory balances;
- sale totals;
- stock deductions;
- entitlement status;
- audit immutability.

These controls must be enforced through trusted services, transactions, database rules or backend functions.

## Domain boundaries

The application should be organized around:

- tenancy;
- organisation structure;
- suppliers;
- purchasing;
- receiving;
- inventory;
- stocktake;
- shifts;
- sales;
- payments;
- approvals;
- BI;
- notifications;
- reporting;
- offline synchronization.

Modules must not directly rewrite another module's authoritative records.

## Transaction architecture

A successful business command should follow:

Command
→ authentication
→ tenant resolution
→ authorization
→ validation
→ approval check
→ authoritative transaction
→ ledger/state update
→ audit event
→ BI event
→ notification
→ reporting projection

## Offline architecture

- Offline commands use durable unique identifiers.
- Offline records remain pending until authoritative server acknowledgement.
- Replay must be idempotent.
- Conflicts cannot be silently overwritten.
- Local completion and server synchronization must be represented separately.

## SCI Console boundary

iTred Commerce POS and SCI Console are separate applications sharing approved database structures.

Vendor onboarding must submit a verification record to SCI Console.

SCI Console must not bypass tenant isolation without explicit privileged authorization and audit logging.
