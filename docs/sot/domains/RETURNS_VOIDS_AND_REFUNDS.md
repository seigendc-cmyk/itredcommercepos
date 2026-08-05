# Returns, Voids and Refunds

## 1. Principle

Posted sales cannot be directly edited or deleted.

Corrections must use controlled, linked and auditable transactions.

## 2. Void

A void applies only under the approved timing and status policy.

A void must:

- reference the original sale;
- record reason;
- identify actor;
- require approval where applicable;
- reverse stock where appropriate;
- reverse or cancel payment where appropriate;
- generate audit and BI events.

## 3. Customer return

A return must identify:

- original sale;
- original sale line;
- returned quantity;
- return condition;
- return location;
- reason;
- actor;
- customer where applicable;
- approval;
- inventory effect;
- payment effect.

Returned stock must be classified as:

- available;
- damaged;
- quarantined;
- rejected.

It must not automatically become available stock without condition validation.

## 4. Refund

Refund types:

- full refund;
- partial refund;
- payment-method refund;
- customer account credit where approved.

Refund value must not exceed eligible remaining value from the original sale.

## 5. State integrity

Correction transactions must preserve:

- original sale;
- previous refunds;
- remaining refundable quantity;
- remaining refundable value;
- original payment method;
- inventory effects;
- approval history.

## 6. Approval triggers

Approval may be required based on:

- refund value;
- return quantity;
- return without receipt;
- return age;
- damaged condition;
- cash refund;
- user role;
- repeated refund behaviour;
- suspected abuse.

## 7. Required events

- `VOID_REQUESTED`
- `VOID_APPROVED`
- `VOID_REJECTED`
- `SALE_VOIDED`
- `RETURN_CREATED`
- `RETURN_APPROVED`
- `RETURN_REJECTED`
- `REFUND_REQUESTED`
- `REFUND_APPROVED`
- `REFUND_REJECTED`
- `REFUND_COMPLETED`
- `RETURN_WITHOUT_RECEIPT_ATTEMPTED`
- `REFUND_LIMIT_BLOCKED`

## 8. Acceptance criteria

- Original completed sale remains immutable.
- Refund cannot exceed remaining eligible value.
- Return cannot exceed remaining eligible quantity.
- Inventory disposition is explicit.
- Unauthorized correction is rejected.
- Duplicate refund replay does not duplicate payment or stock effects.
