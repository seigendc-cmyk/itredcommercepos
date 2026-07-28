import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollectionActivity, CreditPayment, CreditSale, Customer } from '../../types';
import {
  fetchCollectionActivities,
  fetchCreditPayments,
  fetchCreditSales,
  fetchCustomers,
} from '../../services/db';
import {
  CustomerManagement,
  filterCustomers,
  getCustomerAccountHistory,
  normalizeCustomerSaveInput,
} from './CustomerManagement';
import { getVisibleSidebarMenuIds } from '../Sidebar';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const vendorId = 'vendor_a';
const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'cust_test', vendorId, customerCode: 'CUST-TEST', name: 'Test Retailer',
  phone: '0772000000', email: 'accounts@test.example', address: '1 Test Road', creditLimit: 5000,
  currentBalance: 1250, creditTermsDays: 30, riskCategory: 'low', status: 'active', notes: 'Test notes',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

function render(customers: Customer[], props: Partial<React.ComponentProps<typeof CustomerManagement>> = {}) {
  return renderToStaticMarkup(
    <CustomerManagement
      vendorId={vendorId}
      customers={customers}
      creditSales={[]}
      creditPayments={[]}
      collectionActivities={[]}
      loading={false}
      error={null}
      onSaveCustomer={async () => {}}
      onRefresh={async () => {}}
      {...props}
    />,
  );
}

test.beforeEach(() => { Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true }); });

test('loads every customer workspace dataset with vendor-scoped service calls', async () => {
  const [customers, sales, payments, activities] = await Promise.all([
    fetchCustomers(vendorId),
    fetchCreditSales(vendorId),
    fetchCreditPayments(vendorId),
    fetchCollectionActivities(vendorId),
  ]);
  for (const dataset of [customers, sales, payments, activities]) {
    assert.ok(dataset.every(item => item.vendorId === vendorId));
  }
  assert.ok(localStorage.getItem('itred_pos_vendor_data__customers_vendor_a'));
  assert.ok(localStorage.getItem('itred_pos_vendor_data__credit_sales_vendor_a'));
  assert.ok(localStorage.getItem('itred_pos_vendor_data__credit_payments_vendor_a'));
  assert.ok(localStorage.getItem('itred_pos_vendor_data__collections_vendor_a'));
});

test('creates a customer save request without inventing an id or balance', () => {
  const created = normalizeCustomerSaveInput({ customerCode: '', name: ' New Buyer ', phone: ' 0772111111 ', email: '', address: '', creditLimit: 1000, creditTermsDays: 14, riskCategory: 'medium', status: 'active', notes: '' });
  assert.equal(created.name, 'New Buyer');
  assert.equal(created.phone, '0772111111');
  assert.equal(created.id, undefined);
  assert.equal(created.currentBalance, undefined);
});

test('edits a customer while preserving its service identity and balance fields', () => {
  const edited = normalizeCustomerSaveInput({ ...customer(), name: ' Renamed Account ', riskCategory: 'high' });
  assert.equal(edited.id, 'cust_test');
  assert.equal(edited.currentBalance, 1250);
  assert.equal(edited.name, 'Renamed Account');
});

test('restricts customer navigation to staff granted the customers menu', () => {
  assert.ok(getVisibleSidebarMenuIds(['desk', 'customers']).includes('customers'));
  assert.ok(!getVisibleSidebarMenuIds(['desk', 'pos']).includes('customers'));
});

test('renders every supported risk and status category', () => {
  const html = render([
    customer({ id: '1', riskCategory: 'low', status: 'active' }),
    customer({ id: '2', riskCategory: 'medium', status: 'suspended' }),
    customer({ id: '3', riskCategory: 'high', status: 'closed' }),
    customer({ id: '4', riskCategory: 'blacklisted', status: 'active' }),
  ]);
  for (const value of ['low', 'medium', 'high', 'blacklisted', 'Active', 'Suspended', 'Closed']) assert.match(html, new RegExp(value, 'i'));
});

test('renders the current outstanding credit balance', () => {
  assert.match(render([customer()]), /\$1,250\.00/);
});

test('renders the configured credit limit', () => {
  assert.match(render([customer()]), /\$5,000\.00/);
});

function accountHistoryFixture() {
  const sale = { id: 'sale_1', vendorId, customerId: 'cust_test' } as CreditSale;
  const payment = { id: 'payment_1', vendorId, customerId: 'cust_test' } as CreditPayment;
  const activity = { id: 'activity_1', vendorId, customerId: 'cust_test' } as CollectionActivity;
  return getCustomerAccountHistory(
    vendorId,
    'cust_test',
    [sale, { ...sale, id: 'sale_other_customer', customerId: 'other' }, { ...sale, id: 'sale_other_vendor', vendorId: 'vendor_b' }],
    [payment, { ...payment, id: 'payment_other_customer', customerId: 'other' }, { ...payment, id: 'payment_other_vendor', vendorId: 'vendor_b' }],
    [activity, { ...activity, id: 'activity_other_customer', customerId: 'other' }, { ...activity, id: 'activity_other_vendor', vendorId: 'vendor_b' }],
  );
}

test('filters credit-sale history by vendor and customer', () => {
  const result = accountHistoryFixture();
  assert.deepEqual(result.creditSales.map(item => item.id), ['sale_1']);
});

test('filters payment history by vendor and customer', () => {
  const result = accountHistoryFixture();
  assert.deepEqual(result.creditPayments.map(item => item.id), ['payment_1']);
});

test('filters collection activity by vendor and customer', () => {
  const result = accountHistoryFixture();
  assert.deepEqual(result.collectionActivities.map(item => item.id), ['activity_1']);
});

test('renders a customer empty state', () => {
  assert.match(render([]), /No customers yet/);
});

test('renders a customer service failure state', () => {
  const html = render([], { error: 'Customer service unavailable' });
  assert.match(html, /Customer service unavailable/);
  assert.match(html, /role="alert"/);
});

test('renders the customer workspace loading state', () => {
  assert.match(render([], { loading: true }), /Loading customers/);
});

test('searches name, phone, email and customer code', () => {
  const list = [customer()];
  for (const query of ['Test Retailer', '0772', 'accounts@test', 'CUST-TEST']) assert.equal(filterCustomers(list, query).length, 1);
  assert.equal(filterCustomers(list, 'missing').length, 0);
});
