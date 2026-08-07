"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const transferAccounting_js_1 = require("./transferAccounting.js");
const dispatched = { productId: 'p1', quantityApproved: 10, quantityDispatched: 10, quantityReceived: 0, quantityDisputed: 0, quantityReversed: 0 };
(0, node_test_1.default)('partial receipt consumes only outstanding in-transit quantity', () => {
    const partial = (0, transferAccounting_js_1.applyReceipt)(dispatched, 4);
    strict_1.default.equal(partial.quantityReceived, 4);
    strict_1.default.equal((0, transferAccounting_js_1.outstandingQuantity)(partial), 6);
    strict_1.default.equal((0, transferAccounting_js_1.transferReconciles)(partial), true);
});
(0, node_test_1.default)('receipt above outstanding in-transit quantity is rejected', () => {
    strict_1.default.throws(() => (0, transferAccounting_js_1.applyReceipt)(dispatched, 11), /exceeds outstanding/);
});
(0, node_test_1.default)('discrepancy remains explicit and reconcilable', () => {
    const disputed = (0, transferAccounting_js_1.applyDiscrepancy)((0, transferAccounting_js_1.applyReceipt)(dispatched, 7), 2);
    strict_1.default.equal(disputed.quantityDisputed, 2);
    strict_1.default.equal((0, transferAccounting_js_1.outstandingQuantity)(disputed), 1);
    strict_1.default.equal((0, transferAccounting_js_1.transferReconciles)(disputed), true);
});
(0, node_test_1.default)('seeded divergence is detected without mutation', () => {
    const divergent = { ...dispatched, quantityReceived: 8, quantityDisputed: 3 };
    const original = structuredClone(divergent);
    strict_1.default.equal((0, transferAccounting_js_1.transferReconciles)(divergent), false);
    strict_1.default.deepEqual(divergent, original);
});
