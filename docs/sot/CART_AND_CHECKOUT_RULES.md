# Cart and Checkout Rules

Status: Approved MVP rules
Version: 1.0
Owner: iTred Commerce Operations Engineering
Last updated: 27 July 2026

## Cart scope

- A cart is scoped to the authenticated vendor, active staff member, active branch and active terminal.
- Only active-branch stock is saleable.
- Warehouse stock and another branch's stock must not appear as available POS stock.
- Adding a cart line does not reserve or deduct authoritative inventory.
- UI totals are previews and do not replace authoritative checkout validation.

## Lines and totals

- Quantities must be positive and valid for the product unit.
- Equivalent duplicate lines may merge; distinct price, tax, unit, batch or serial context must remain separate.
- Delivery charges are shown separately from products and tax.
- Discounts and overrides require existing permissions or approvals.
- Tax, currency, rounding and exchange-rate treatment must come from approved configuration where implemented.
- Completed price and tax snapshots are immutable.

## Checkout preconditions

The authoritative service must validate:

- authenticated vendor and active staff;
- POS permission;
- active licensed branch;
- active licensed terminal assigned to that branch;
- open shift where required;
- current price, tax and branch inventory;
- sufficient stock;
- valid payment totals;
- a unique checkout attempt or idempotency key.

The UI must not weaken or replace these checks.

## Atomic completion

Order, lines, payment, guarded branch deduction, inventory movements and required snapshots must commit atomically. Any required validation or write failure rejects the sale and rolls back required writes. Stock must not be clamped to hide insufficiency.

A later BI write failure must not reverse an otherwise committed sale, but must remain available for retry.

## Delivery

- Delivery is available only under an entitled plan or add-on.
- The delivery fee is visible before payment.
- Assignment occurs only after confirmed checkout.
- Notification failure does not reverse a committed sale.

## Completion and correction

- Completed sales are immutable.
- Refunds, reversals, credit notes and debit notes are linked correction transactions.
- Repeating an idempotency key must not deduct stock twice.

## Offline

Controlled offline checkout requires both approved deployment flags and every control in `CONTROLLED_OFFLINE_CHECKOUT_AMENDMENT.md`. A controlled offline sale uses `COMPLETED_PENDING_SYNC` and must not be represented as synchronized without authoritative acknowledgement.

## UI

Checkout controls expose loading, disabled and error states. Core workflows use inline errors or controlled dialogs, not browser alerts. Keyboard navigation, labels and visible focus are mandatory.
