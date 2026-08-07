"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.outstandingQuantity = outstandingQuantity;
exports.assertPositiveQuantity = assertPositiveQuantity;
exports.applyReceipt = applyReceipt;
exports.applyDiscrepancy = applyDiscrepancy;
exports.transferReconciles = transferReconciles;
function outstandingQuantity(line) {
    return line.quantityDispatched - line.quantityReceived - line.quantityDisputed - line.quantityReversed;
}
function assertPositiveQuantity(quantity) {
    if (!Number.isFinite(quantity) || quantity <= 0)
        throw new Error('Quantity must be positive.');
}
function applyReceipt(line, quantity) {
    assertPositiveQuantity(quantity);
    if (quantity > outstandingQuantity(line))
        throw new Error('Receipt exceeds outstanding in-transit quantity.');
    return { ...line, quantityReceived: line.quantityReceived + quantity };
}
function applyDiscrepancy(line, quantity) {
    assertPositiveQuantity(quantity);
    if (quantity > outstandingQuantity(line))
        throw new Error('Discrepancy exceeds outstanding in-transit quantity.');
    return { ...line, quantityDisputed: line.quantityDisputed + quantity };
}
function transferReconciles(line) {
    const outstanding = outstandingQuantity(line);
    return outstanding >= 0 && line.quantityDispatched === line.quantityReceived + outstanding + line.quantityDisputed + line.quantityReversed;
}
