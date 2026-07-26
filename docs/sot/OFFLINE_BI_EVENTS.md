# Offline BI Event Catalogue

- `OFFLINE_CHECKOUT_STARTED`
- `OFFLINE_SALE_COMPLETED`
- `OFFLINE_SALE_FAILED`
- `OFFLINE_SALE_BLOCKED`
- `OFFLINE_STOCK_DEDUCTED`
- `OFFLINE_PAYMENT_RECORDED`
- `OFFLINE_RECEIPT_GENERATED`
- `OFFLINE_OUTBOX_CREATED`
- `DEVICE_ENROLMENT_FAILED`
- `OFFLINE_ENCRYPTION_FAILURE`
- `OFFLINE_DUPLICATE_SALE_BLOCKED`

Events preserve occurrence time, tenant, vendor, branch, terminal, device, cashier, shift, affected entity, outcome, reason code and offline state. Synchronization must not replace the original occurrence time.
