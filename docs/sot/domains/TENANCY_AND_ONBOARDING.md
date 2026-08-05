# Tenancy and Onboarding

## 1. Purpose

This document governs vendor tenant creation, default infrastructure provisioning, membership, trial access, SCI Console verification, subscription status and tenant isolation.

## 2. Tenant authority

Every operational record must belong to one authoritative vendor tenant.

Every tenant-scoped record must contain or inherit:

- `tenantId`
- `vendorId`
- record status
- creation timestamp
- creating actor
- record version where concurrent modification is possible

A `vendorId` supplied by the client must never, by itself, grant access to that vendor.

Tenant membership and permission must be resolved from trusted authentication and membership records.

## 3. Vendor lifecycle

Canonical vendor statuses:

```text
DRAFT
â†’ SUBMITTED
â†’ DEMO_ACTIVE
â†’ VERIFICATION_PENDING
â†’ VERIFIED
â†’ ACTIVE
```

Exception or terminal statuses:

```text
REJECTED
DEMO_EXPIRED
SUSPENDED
CANCELLED
ARCHIVED
```

## 4. Onboarding transaction

Successful onboarding must provision, idempotently:

1. Vendor tenant.
2. Vendor owner membership.
3. One default warehouse.
4. One default branch.
5. One default terminal belonging to the default branch.
6. Starter Plan entitlement.
7. Seven-day demo period.
8. SCI Console verification submission.
9. Audit event.
10. BI event.
11. Vendor-owner notification.

Provisioning must either complete as one controlled workflow or leave an explicit recoverable failure state.

Repeated onboarding requests with the same idempotency key must not create duplicate tenants, warehouses, branches, terminals or memberships.

## 5. Default infrastructure

Every new vendor receives:

| Resource | Included quantity |
|---|---:|
| Warehouse | 1 |
| Branch | 1 |
| POS terminal | 1 |

The default terminal must belong to the default branch.

A terminal cannot belong directly to a warehouse.

## 6. Seven-day demo access

The demo period begins only when tenant provisioning succeeds.

The vendor record must contain:

- `demoStartedAt`
- `demoExpiresAt`
- `entitlementStatus`
- `verificationStatus`

Demo expiry must not delete business records.

When demo access expires:

- new operational transactions may be restricted according to entitlement policy;
- historical records remain available according to role and retention rules;
- pending synchronization and reconciliation must not be discarded;
- the tenant may be reactivated after licensing.

## 7. SCI Console verification

iTred Commerce POS and SCI Console are separate applications using approved shared database structures.

Successful onboarding must submit a verification record containing:

- tenant ID;
- vendor ID;
- legal or trading name;
- owner identity;
- contact details;
- business address;
- registration information where supplied;
- onboarding timestamp;
- demo expiry;
- verification status;
- source application;
- record version.

SCI Console verification statuses:

```text
PENDING
UNDER_REVIEW
INFORMATION_REQUIRED
APPROVED
REJECTED
SUSPENDED
```

SCI Console decisions must be auditable.

## 8. Membership

A membership must identify:

- tenant;
- user UID;
- role;
- assigned warehouses;
- assigned branches;
- assigned terminals where applicable;
- status;
- effective date;
- expiry where applicable;
- permission version.

Membership statuses:

```text
INVITED
ACTIVE
SUSPENDED
REVOKED
EXPIRED
```

## 9. Tenant isolation

The application must reject:

- cross-vendor reads;
- cross-vendor writes;
- cross-vendor stock movements;
- cross-vendor sales;
- cross-vendor approvals;
- cross-vendor reports;
- cross-vendor BI access.

Privileged SCI support access must be explicit, permission-controlled and audited.

## 10. Required events

At minimum:

- `TENANT_ONBOARDING_STARTED`
- `TENANT_ONBOARDING_COMPLETED`
- `TENANT_ONBOARDING_FAILED`
- `DEFAULT_WAREHOUSE_PROVISIONED`
- `DEFAULT_BRANCH_PROVISIONED`
- `DEFAULT_TERMINAL_PROVISIONED`
- `MEMBERSHIP_CREATED`
- `DEMO_STARTED`
- `DEMO_EXPIRED`
- `VERIFICATION_SUBMITTED`
- `VERIFICATION_STATUS_CHANGED`
- `TENANT_SUSPENDED`
- `TENANT_REACTIVATED`

## 11. Acceptance criteria

- Repeating onboarding does not duplicate resources.
- Warehouse, branch and terminal belong to the same tenant.
- Default terminal belongs to the default branch.
- A user from another tenant cannot read or modify the tenant.
- Seven-day demo dates are persisted.
- SCI Console verification record is created.
- Failed provisioning produces an explicit recoverable status.
- Audit and BI events are generated.
