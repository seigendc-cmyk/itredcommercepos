# MVP Critical Inventory Approval Rules

- Warehouse-to-branch transfers, branch-to-branch transfers, supplier receipts, incomplete purchase-order cancellations, opening balances, and stocktake adjustments use the existing approvals queue.
- Critical inventory requests use the statuses `DRAFT`, `SUBMITTED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`, `PROCESSING`, `COMPLETED`, and `FAILED`.
- Warehouse staff, managers, and system administrators may submit controlled inventory requests. Only managers and system administrators may approve or reject them.
- A requester may cancel their own pending request. Managers and system administrators may cancel according to the workflow policy.
- When segregation of duties is enabled, requesters cannot approve or reject their own requests.
- Supplier receipt auto-approval is disabled by default. It is allowed only for roles listed in the vendor's active inventory approval policy.
- Submission, approval, rejection, cancellation, processing, completion, and failure checks must occur in the service layer and cannot rely on UI visibility.
- Approval decisions require the expected request version. Stale or duplicate decisions are rejected.
- Approval, inventory rereads, balance validation, inventory writes, movement records, entity completion, and append-only audit events must commit atomically.
- Rejected or cancelled requests create no inventory movement.
- Every workflow transition records tenant, vendor, entity, requester, decision actor, timestamps, outcome, reason, resource context, version, and before/after quantities where applicable.
- Pending requests notify only the authorised approval roles through the existing staff desk and approvals queue.
