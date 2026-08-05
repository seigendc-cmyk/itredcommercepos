# Approval Workflows

## 1. Purpose

The approval system provides a shared controlled workflow for financially, operationally or security-sensitive actions.

## 2. Approval scope

The MVP must support approvals for:

- purchase requisitions;
- purchase orders;
- supplier receipts;
- stock transfers;
- stock adjustments;
- stocktake variances;
- price overrides;
- discounts;
- voids;
- returns;
- refunds;
- shift variances;
- sensitive role or permission changes.

## 3. Canonical approval lifecycle

```text
DRAFT
â†’ SUBMITTED
â†’ PENDING_APPROVAL
â†’ APPROVED
â†’ PROCESSING
â†’ COMPLETED
```

Exception states:

```text
REJECTED
CANCELLED
EXPIRED
FAILED
```

Where multiple approval stages are required:

```text
PENDING_LEVEL_1
â†’ LEVEL_1_APPROVED
â†’ PENDING_LEVEL_2
â†’ APPROVED
```

## 4. Approval request structure

Every approval request must identify:

- approval request ID;
- tenant;
- vendor;
- resource type;
- resource ID;
- requester;
- requester's role;
- request timestamp;
- requested action;
- financial or stock effect;
- reason;
- policy ID;
- policy version;
- resource version;
- eligible approvers;
- required approval count;
- current status;
- expiry;
- correlation ID.

## 5. Policy

Approval policy may consider:

- amount;
- currency;
- quantity;
- value variance;
- resource type;
- product risk;
- branch;
- warehouse;
- requester role;
- approver role;
- time of day;
- offline status;
- repeated behaviour;
- risk severity.

## 6. Authorization

Approval permission must be checked when the decision is made.

UI visibility does not grant approval authority.

The decision service must verify:

- tenant membership;
- active role;
- current permission;
- location scope;
- policy eligibility;
- request version;
- resource version;
- request status;
- segregation-of-duties rule.

## 7. Segregation of duties

When enabled:

- requester cannot approve their own request;
- counter cannot approve their own material stocktake variance;
- cashier cannot approve their own material shift variance;
- receiving actor cannot approve their own high-risk receipt;
- permission change requester cannot self-approve where policy prohibits it.

## 8. Concurrency

Approval decisions require expected request and resource versions.

Stale or duplicate decisions must be rejected.

Two approvers must not independently cause the same downstream transaction to post twice.

## 9. Processing after approval

Approval does not automatically mean the business transaction completed.

The system must distinguish:

- approval decision;
- processing;
- completed business effect;
- failed processing.

Where possible, approval and downstream posting should use a controlled atomic workflow.

## 10. Rejection and cancellation

Rejected or cancelled requests must not create:

- inventory movement;
- sale correction;
- payment movement;
- entitlement activation;
- permission change;
- other material business effect.

## 11. Escalation and expiry

Approval policy may define:

- response deadline;
- escalation recipient;
- reminder interval;
- expiry behaviour;
- reassignment;
- delegated approver.

Escalation does not permit unauthorized approval.

## 12. Required events

- `APPROVAL_REQUEST_CREATED`
- `APPROVAL_REQUEST_SUBMITTED`
- `APPROVAL_REMINDER_SENT`
- `APPROVAL_ESCALATED`
- `APPROVAL_APPROVED`
- `APPROVAL_REJECTED`
- `APPROVAL_CANCELLED`
- `APPROVAL_EXPIRED`
- `APPROVAL_STALE_DECISION_REJECTED`
- `SELF_APPROVAL_BLOCKED`
- `APPROVED_ACTION_PROCESSING`
- `APPROVED_ACTION_COMPLETED`
- `APPROVED_ACTION_FAILED`

## 13. Acceptance criteria

- Unauthorized approver is rejected.
- Cross-tenant approval is rejected.
- Self-approval is rejected where segregation is enabled.
- Stale version is rejected.
- Duplicate decision does not duplicate downstream effect.
- Rejected request creates no material transaction.
- Approval notification reaches only eligible users.
