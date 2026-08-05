# Payments and Receipts

## 1. Purpose

Payments record the value received or owed for a sale.

Receipts provide an immutable customer-facing reference to the completed sale.

## 2. Payment methods

The MVP may support configured methods including:

- cash;
- card;
- mobile money;
- bank transfer;
- customer account;
- split payment;
- other approved tender types.

Availability may depend on:

- tenant;
- branch;
- terminal;
- online or offline status;
- currency;
- entitlement;
- integration status.

## 3. Payment record

Every payment must contain:

- payment ID;
- tenant;
- vendor;
- sale;
- branch;
- terminal;
- shift;
- payment method;
- amount;
- currency;
- status;
- external reference where applicable;
- collected actor;
- occurred time;
- offline status;
- idempotency key;
- reversal reference where applicable.

## 4. Payment statuses

```text
PENDING
AUTHORIZED
COMPLETED
FAILED
CANCELLED
REVERSED
REFUNDED
PARTIALLY_REFUNDED
```

## 5. Tender validation

The sum of accepted payments must reconcile to the sale amount according to the permitted tender rules.

Overpayment and change rules must be explicit.

Cash change must not be represented as additional revenue.

## 6. Split payment

Split payment must:

- belong to one sale;
- preserve each tender component;
- reconcile to the final amount;
- fail safely when one component fails;
- follow an approved rollback or pending-payment policy.

## 7. External payments

Where a payment provider is used:

- provider response must be recorded;
- sensitive card data must not be stored;
- client claims must not replace provider or trusted confirmation;
- retries must be idempotent;
- reconciliation status must be visible.

## 8. Receipt numbering

Receipt numbering must be:

- unique within the approved numbering scope;
- immutable after issue;
- traceable to vendor, branch and terminal;
- resistant to duplicate assignment;
- compatible with offline numbering rules.

The numbering scope must be documented in the technical contract.

## 9. Receipt contents

A receipt should include:

- vendor identity;
- branch;
- terminal;
- receipt number;
- sale ID;
- date and time;
- cashier;
- sale items;
- quantities;
- prices;
- discounts;
- taxes;
- total;
- payment methods;
- change where applicable;
- fiscal status where applicable;
- offline or pending-sync status where required.

## 10. Reprinting

Receipt reprinting must:

- retain original details;
- record reprint actor;
- record reason where policy requires;
- generate a BI event;
- not issue another receipt number;
- not create another payment or sale.

## 11. Acceptance criteria

- Payment total reconciles to sale total.
- Duplicate payment replay does not duplicate payment.
- Failed external payment does not produce a completed sale unless an approved pending-payment flow exists.
- Receipt numbers are not duplicated.
- Reprinting does not alter the sale.
