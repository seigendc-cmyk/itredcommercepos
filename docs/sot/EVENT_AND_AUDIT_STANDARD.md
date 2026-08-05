# Event and Audit Standard

Every meaningful business, operational, security, approval and system action must generate an immutable event.

## Required fields

- eventId
- eventType
- eventVersion
- tenantId
- vendorId
- warehouseId where applicable
- branchId where applicable
- terminalId where applicable
- actorId
- roleId where applicable
- entityType
- entityId
- action
- outcome
- reasonCode where applicable
- occurredAt
- recordedAt
- correlationId
- idempotencyKey where applicable
- offlineEvent
- metadata

## Event outcomes

- STARTED
- COMPLETED
- FAILED
- BLOCKED
- CANCELLED
- REJECTED
- APPROVED

## Prohibited capture

Do not record:

- passwords;
- authentication secrets;
- complete payment-card data;
- encryption keys;
- keystroke logs;
- cursor coordinates;
- mouse movement;
- meaningless UI activity.

## Immutability

Historical events cannot be edited or deleted by ordinary application users.

Corrections must create a compensating event referencing the original event.
