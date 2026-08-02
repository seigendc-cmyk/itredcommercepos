import { ProductSector, ProductSectorAttributes, ProductType, TaxOption } from '../../types';

export const PRODUCT_SECTORS: ReadonlyArray<{ value: ProductSector; label: string }> = [
  { value: 'MOTOR_SPARES', label: 'Motor Spares' }, { value: 'CLOTHING', label: 'Clothing' },
  { value: 'PHARMACY', label: 'Pharmacy' }, { value: 'GROCERIES', label: 'Groceries' },
  { value: 'FURNITURE', label: 'Furniture' }, { value: 'HARDWARE', label: 'Hardware' },
  { value: 'AGRO_CHEMICALS', label: 'Agro Chemicals' }, { value: 'GENERAL', label: 'General' },
  { value: 'SERVICES', label: 'Services' },
];

export const TAX_OPTIONS: ReadonlyArray<{ value: TaxOption; label: string }> = [
  { value: 'STANDARD_RATED', label: 'Standard Rated' }, { value: 'ZERO_RATED', label: 'Zero Rated' },
  { value: 'EXEMPT', label: 'Exempt' }, { value: 'NON_TAXABLE', label: 'Non-Taxable' },
  { value: 'OUT_OF_SCOPE', label: 'Out of Scope' },
];

export const PRODUCT_FORM_FIELD_ORDER = [
  'productType', 'sector', 'category', 'name', 'sku', 'barcode', 'description', 'costPrice', 'sellingPrice',
  'quantity', 'location', 'shelfCode', 'binCode', 'unitOfMeasure', 'size', 'alternativeLookupCode', 'hsCode',
  'taxOption', 'reorderLevel', 'primarySupplier', 'brandManufacturer', 'sectorAttributes', 'status',
] as const;

export const SECTOR_ATTRIBUTE_FIELDS: Record<ProductSector, ReadonlyArray<keyof ProductSectorAttributes>> = {
  MOTOR_SPARES: ['vehicleMake', 'vehicleModel', 'vehicleYearFrom', 'vehicleYearTo', 'engineCode', 'chassisCode', 'oemNumber', 'manufacturerPartNumber', 'fitmentPosition', 'leftRightPosition'],
  CLOTHING: ['brand', 'garmentType', 'gender', 'size', 'colour', 'material', 'season', 'styleCode'],
  PHARMACY: ['genericName', 'brandName', 'strength', 'dosageForm', 'packSize', 'batchTrackingRequired', 'expiryTrackingRequired', 'prescriptionClass', 'storageCondition'],
  GROCERIES: ['brand', 'packSize', 'netWeight', 'volume', 'flavour', 'perishable', 'expiryTrackingRequired', 'storageCondition'],
  FURNITURE: ['material', 'dimensions', 'colour', 'finish', 'assemblyRequired', 'roomType', 'weight'],
  HARDWARE: ['brand', 'material', 'dimensions', 'grade', 'threadSize', 'voltage', 'wattage', 'capacity', 'specification'],
  AGRO_CHEMICALS: ['activeIngredient', 'concentration', 'formulation', 'packSize', 'hazardClass', 'registrationNumber', 'expiryTrackingRequired', 'storageCondition', 'restrictedSale'],
  GENERAL: ['brand', 'manufacturer', 'model', 'colour', 'size', 'material'],
  SERVICES: ['serviceDuration', 'serviceUnit', 'serviceDepartment', 'requiresAppointment', 'serviceNotes'],
};

export const BOOLEAN_SECTOR_FIELDS = new Set<keyof ProductSectorAttributes>(['batchTrackingRequired', 'expiryTrackingRequired', 'perishable', 'assemblyRequired', 'restrictedSale', 'requiresAppointment']);

export function normalizeHsCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s*([.\-/])\s*/g, '$1').replace(/\s+/g, ' ');
}

export function validateHsCode(value: string): string | null {
  if (!value.trim()) return null;
  const normalized = normalizeHsCode(value);
  if (!/^[0-9A-Z][0-9A-Z .\-/]{1,31}$/.test(normalized)) return 'HS Code must contain 2–32 letters or digits with optional spaces, dots, slashes or hyphens.';
  return null;
}

export function effectiveProductTaxRate(taxOption: TaxOption, vendorStandardRate: number): number {
  if (taxOption === 'STANDARD_RATED') return vendorStandardRate;
  return 0;
}

export function productAllowsOpeningQuantity(productType: ProductType): boolean {
  return productType === 'INVENTORY' || productType === 'BOM';
}

export function sanitizeSectorAttributes(sector: ProductSector, attributes: ProductSectorAttributes): ProductSectorAttributes {
  const allowed = new Set(SECTOR_ATTRIBUTE_FIELDS[sector]);
  return Object.fromEntries(Object.entries(attributes).filter(([key, value]) => allowed.has(key as keyof ProductSectorAttributes) && value !== '' && value !== undefined)) as ProductSectorAttributes;
}
