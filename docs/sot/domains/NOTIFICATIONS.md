# Notifications

## 1. Purpose

Notifications inform authorized users about actions, exceptions, risks and operational status.

Notifications must be driven by domain events and policies, not scattered screen-specific code.

## 2. Notification model

The system must distinguish:

1. Domain event.
2. Notification rule.
3. Notification record.
4. Delivery attempt.
5. User acknowledgement.

## 3. Notification categories

- ACTION_REQUIRED
- WARNING
- FAILURE
- SECURITY
- INFORMATION
- REMINDER

## 4. Notification severity

- INFO
- LOW
- MEDIUM
- HIGH
- CRITICAL

## 5. Notification record

Every notification must identify:

- notification ID;
- tenant;
- vendor;
- recipient user or role;
- warehouse, branch or terminal context where applicable;
- category;
- severity;
- title;
- message;
- source event type;
- source event ID;
- entity type;
- entity ID;
- action link or route where applicable;
- created time;
- expiry;
- read status;
- acknowledgement status;
- escalation status;
- deduplication key.

## 6. Required notification triggers

### Approvals

- approval required;
- approval reminder;
- approval escalation;
- request approved;
- request rejected;
- approved action failed.

### Purchasing and receiving

- purchase order approved;
- purchase order issued;
- delivery overdue;
- purchase partially received;
- over-receipt blocked;
- receiving approval required;
- damaged or rejected delivery;
- receipt posting failed.

### Inventory and stocktake

- low stock;
- out of stock;
- transfer dispatched;
- transfer overdue;
- transfer discrepancy;
- stocktake assigned;
- stocktake overdue;
- recount required;
- material variance;
- adjustment approval required;
- adjustment posting failed.

### Sales and shifts

- discount approval required;
- price override approval required;
- failed checkout;
- offline sale sync failure;
- refund approval required;
- suspicious repeated refund;
- shift variance;
- delayed shift closure.

### Tenancy and security

- demo expiry approaching;
- demo expired;
- resource licence required;
- verification status changed;
- failed login threshold;
- privileged access;
- role or permission changed;
- tenant suspended.

## 7. Recipient resolution

Recipients must be resolved by:

- tenant;
- role;
- permission;
- location assignment;
- resource ownership;
- approval eligibility;
- escalation policy.

Notifications must not be sent to unauthorized roles merely because they can see the same menu.

## 8. Deduplication

Repeated identical events must not create notification flooding.

Notification rules may group by:

- source event;
- entity;
- recipient;
- time window;
- severity;
- deduplication key.

Critical new information must not be hidden by deduplication.

## 9. Read and acknowledgement

The system must distinguish:

- delivered;
- read;
- acknowledged;
- acted upon;
- expired.

Reading a notification does not imply the underlying business action was completed.

## 10. Escalation

Escalation policies may define:

- response deadline;
- reminder interval;
- next-level recipient;
- maximum escalation level;
- expiry behaviour.

## 11. Delivery channels

Initial MVP channel:

- in-app notification desk.

Future approved channels may include:

- email;
- push notification;
- SMS;
- WhatsApp.

Delivery failure must not erase the notification record.

## 12. Acceptance criteria

- Only authorized recipients receive tenant notifications.
- Duplicate events do not flood recipients.
- Read and acknowledgement states remain distinct.
- Approval notification does not itself approve the request.
- Expired notifications do not erase historical events.
- Cross-tenant notification delivery is rejected.
