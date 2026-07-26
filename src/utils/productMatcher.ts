import { Product } from '../types';

export interface SectorConfig {
  sectorKey: string;
  label: string;
  description: string;
  categories: string[];
  defaultUnit: string;
  locationSuggestions: string[];
  shelfSuggestions: string[];
  sampleProducts: {
    sku: string;
    name: string;
    category: string;
    costPrice: number;
    sellingPrice: number;
    unit: string;
    location: string;
    shelf: string;
    reorderLevel: number;
    quantity: number;
  }[];
}

export const SECTOR_CONFIGS: Record<string, SectorConfig> = {
  'automotive': {
    sectorKey: 'automotive',
    label: 'Automotive Parts & Spares',
    description: 'Tailored for auto spares, fitments, OEM numbers, chassis codes, and mechanical components.',
    categories: [
      'Suspension & Steering',
      'Braking System',
      'Engine Parts & Gaskets',
      'Electrical & Ignition',
      'Filters & Lubricants',
      'Transmission & Clutch',
      'Body & Accessories'
    ],
    defaultUnit: 'pcs',
    locationSuggestions: ['Aisle A - Mechanical Depot', 'Aisle B - Electrical Bay', 'Racks C - Heavy Suspension'],
    shelfSuggestions: ['Shelf A1-01', 'Shelf B2-04', 'Bin C3-12', 'Pallet P1'],
    sampleProducts: [
      {
        sku: 'AUTO-BJ-GD1',
        name: 'Honda Fit GD1 Front Ball Joint',
        category: 'Suspension & Steering',
        costPrice: 18.50,
        sellingPrice: 38.00,
        unit: 'pcs',
        location: 'Aisle A - Mechanical Depot',
        shelf: 'Shelf A1-01',
        reorderLevel: 5,
        quantity: 20
      },
      {
        sku: 'AUTO-BP-CIV',
        name: 'Honda Civic Front Brake Pads Ceramic Set',
        category: 'Braking System',
        costPrice: 22.00,
        sellingPrice: 48.00,
        unit: 'set',
        location: 'Aisle A - Mechanical Depot',
        shelf: 'Shelf A2-05',
        reorderLevel: 8,
        quantity: 15
      },
      {
        sku: 'AUTO-OF-TOY',
        name: 'Toyota Corolla 1NZ Spin-On Oil Filter',
        category: 'Filters & Lubricants',
        costPrice: 3.20,
        sellingPrice: 8.50,
        unit: 'pcs',
        location: 'Aisle B - Electrical Bay',
        shelf: 'Shelf B1-02',
        reorderLevel: 20,
        quantity: 50
      },
      {
        sku: 'AUTO-GD1-BJ', // Similar product example to demonstrate fuzzy duplicate detection!
        name: 'Honda GD1 Ball Joint',
        category: 'Suspension & Steering',
        costPrice: 18.50,
        sellingPrice: 38.00,
        unit: 'pcs',
        location: 'Aisle A - Mechanical Depot',
        shelf: 'Shelf A1-02',
        reorderLevel: 5,
        quantity: 10
      }
    ]
  },
  'electronics': {
    sectorKey: 'electronics',
    label: 'Electronics, Tech & Hardware',
    description: 'Designed for computing, gadgets, cables, peripherals, and electronic components.',
    categories: [
      'Monitors & Displays',
      'Computers & Laptops',
      'Peripherals & Cables',
      'Storage & Memory',
      'Audio & Headphones',
      'Components & Boards',
      'Power & Chargers'
    ],
    defaultUnit: 'pcs',
    locationSuggestions: ['Tech Bay - Rack 01', 'Display Counter', 'Secure Storage A'],
    shelfSuggestions: ['Shelf E1-01', 'Bin T2-08', 'Locker S1'],
    sampleProducts: [
      {
        sku: 'ELEC-HD-1TB',
        name: 'Seagate 1TB Portable External Hard Drive USB 3.0',
        category: 'Storage & Memory',
        costPrice: 38.00,
        sellingPrice: 65.00,
        unit: 'pcs',
        location: 'Secure Storage A',
        shelf: 'Locker S1',
        reorderLevel: 4,
        quantity: 12
      },
      {
        sku: 'ELEC-CBL-USBC',
        name: 'Braided USB-C to USB-C Fast Charge Cable 2m',
        category: 'Peripherals & Cables',
        costPrice: 2.10,
        sellingPrice: 9.99,
        unit: 'pcs',
        location: 'Display Counter',
        shelf: 'Bin T2-08',
        reorderLevel: 15,
        quantity: 40
      }
    ]
  },
  'pharmacy': {
    sectorKey: 'pharmacy',
    label: 'Pharmacy, Medical & Healthcare',
    description: 'Optimized for pharmaceuticals, dosages, OTC medications, and clinical supplies.',
    categories: [
      'Prescription Medications',
      'OTC & Pain Relief',
      'Vitamins & Supplements',
      'First Aid & Dressings',
      'Personal Care & Hygiene',
      'Baby & Child Care'
    ],
    defaultUnit: 'box',
    locationSuggestions: ['Pharma Dispensary', 'Cold Storage Unit', 'OTC Front Shelves'],
    shelfSuggestions: ['Shelf P1-03', 'Fridge A', 'Bin Med-09'],
    sampleProducts: [
      {
        sku: 'MED-PARA-500',
        name: 'Paracetamol Extra 500mg Tablets 24s',
        category: 'OTC & Pain Relief',
        costPrice: 1.20,
        sellingPrice: 3.50,
        unit: 'box',
        location: 'OTC Front Shelves',
        shelf: 'Shelf P1-03',
        reorderLevel: 25,
        quantity: 80
      },
      {
        sku: 'MED-VIT-C1000',
        name: 'Efervescent Vitamin C 1000mg 20 Tablets',
        category: 'Vitamins & Supplements',
        costPrice: 3.50,
        sellingPrice: 8.90,
        unit: 'tube',
        location: 'OTC Front Shelves',
        shelf: 'Shelf P2-01',
        reorderLevel: 10,
        quantity: 30
      }
    ]
  },
  'supermarket': {
    sectorKey: 'supermarket',
    label: 'Supermarket, Groceries & FMCG',
    description: 'Tailored for food, beverages, daily essentials, household goods, and perishable items.',
    categories: [
      'Beverages & Juices',
      'Bakery & Snacks',
      'Dairy & Eggs',
      'Pantry & Staples',
      'Household & Cleaning',
      'Toiletries'
    ],
    defaultUnit: 'pcs',
    locationSuggestions: ['Aisle 1 - Beverages', 'Aisle 3 - Dry Foods', 'Chiller 2'],
    shelfSuggestions: ['Shelf S1-01', 'Bin B3', 'Rack H2'],
    sampleProducts: [
      {
        sku: 'GROC-COK-2L',
        name: 'Coca-Cola Original Taste 2 Litre Bottle',
        category: 'Beverages & Juices',
        costPrice: 1.10,
        sellingPrice: 2.20,
        unit: 'bottle',
        location: 'Aisle 1 - Beverages',
        shelf: 'Shelf S1-01',
        reorderLevel: 30,
        quantity: 120
      }
    ]
  },
  'general': {
    sectorKey: 'general',
    label: 'General Retail & Hardware',
    description: 'Versatile catalog structure for general stores, trading, and retail goods.',
    categories: [
      'General Merchandise',
      'Hardware & Tools',
      'Packaging & Supplies',
      'Stationery & Office',
      'Apparel & Accessories'
    ],
    defaultUnit: 'pcs',
    locationSuggestions: ['Main Depot', 'Front Showroom', 'Back Storage'],
    shelfSuggestions: ['Shelf 01', 'Shelf 02', 'Bin A1'],
    sampleProducts: [
      {
        sku: 'GEN-TAPE-HVY',
        name: 'Heavy Duty Packaging Tape Clear 50mm',
        category: 'Packaging & Supplies',
        costPrice: 0.80,
        sellingPrice: 2.50,
        unit: 'pcs',
        location: 'Main Depot',
        shelf: 'Shelf 01',
        reorderLevel: 15,
        quantity: 50
      }
    ]
  }
};

/**
 * Gets sector config based on vendor's business sector string.
 */
export function getSectorConfig(businessSector?: string): SectorConfig {
  if (!businessSector) return SECTOR_CONFIGS['general'];
  const lower = businessSector.toLowerCase();
  if (lower.includes('auto') || lower.includes('car') || lower.includes('vehicle') || lower.includes('spare')) {
    return SECTOR_CONFIGS['automotive'];
  }
  if (lower.includes('elec') || lower.includes('computer') || lower.includes('tech') || lower.includes('hardware')) {
    return SECTOR_CONFIGS['electronics'];
  }
  if (lower.includes('pharm') || lower.includes('med') || lower.includes('health') || lower.includes('clinic')) {
    return SECTOR_CONFIGS['pharmacy'];
  }
  if (lower.includes('super') || lower.includes('groc') || lower.includes('food') || lower.includes('market')) {
    return SECTOR_CONFIGS['supermarket'];
  }
  return SECTOR_CONFIGS['general'];
}

/**
 * Tokenize string into clean words, removing special symbols.
 */
export function tokenizeName(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Levenshtein distance between two string tokens.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1,   // insertion
            matrix[i - 1][j] + 1    // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate Fuzzy Similarity Score between two product names (0.0 to 1.0)
 * Example:
 * "Honda Fit GD1 Ball Joint" vs "Honda GD1 Ball Joint"
 * Tokens: ['honda', 'fit', 'gd1', 'ball', 'joint'] vs ['honda', 'gd1', 'ball', 'joint']
 * Common tokens: 'honda', 'gd1', 'ball', 'joint' (4 out of 5) -> 80% Token match!
 */
export function calculateProductSimilarity(nameA: string, nameB: string): {
  score: number;
  percentage: number;
  matchedTokens: string[];
  isSimilar: boolean;
} {
  const tokensA = tokenizeName(nameA);
  const tokensB = tokenizeName(nameB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return { score: 0, percentage: 0, matchedTokens: [], isSimilar: false };
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const matchedTokens: string[] = [];
  setA.forEach(tA => {
    // Exact token match
    if (setB.has(tA)) {
      matchedTokens.push(tA);
    } else {
      // Near fuzzy token match (e.g., 'fitting' vs 'fit')
      for (const tB of Array.from(setB)) {
        if (tA.length > 3 && tB.length > 3) {
          const dist = levenshteinDistance(tA, tB);
          if (dist <= 1) {
            matchedTokens.push(`${tA}~${tB}`);
            break;
          }
        }
      }
    }
  });

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccardScore = unionSize > 0 ? matchedTokens.length / unionSize : 0;

  // Containment score: proportion of the shorter token list contained in the longer
  const minTokens = Math.min(tokensA.length, tokensB.length);
  const containmentScore = minTokens > 0 ? matchedTokens.length / minTokens : 0;

  // Composite similarity score
  const compositeScore = (jaccardScore * 0.6) + (containmentScore * 0.4);
  const percentage = Math.round(compositeScore * 100);

  // Consider similar if score >= 0.55 (55% match) or containment >= 0.75 (3/4 key words match)
  const isSimilar = compositeScore >= 0.55 || containmentScore >= 0.75;

  return {
    score: compositeScore,
    percentage,
    matchedTokens,
    isSimilar
  };
}

export interface ParsedImportRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  unit: string;
  location: string;
  shelf: string;
  reorderLevel: number;
  quantity: number;
  
  // Validation & Duplicate Status
  skuConflict: boolean;
  skuMatchExistingProduct?: Product;
  
  similarityMatch?: {
    existingProduct: Product;
    percentage: number;
    matchedTokens: string[];
  };

  // User Decision
  action: 'IMPORT_NEW' | 'MERGE_STOCK' | 'OVERWRITE' | 'SKIP';
  assignedSku: string;
}

/**
 * Parses raw CSV or Tab-separated text into structured product import rows.
 */
export function parseRawImportText(
  rawText: string,
  existingProducts: Product[],
  defaultSectorConfig: SectorConfig
): ParsedImportRow[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  const results: ParsedImportRow[] = [];

  // Determine if first line is a header
  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  if (firstLine.includes('sku') || firstLine.includes('name') || firstLine.includes('price')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    // Split by tab or comma
    const cells = line.includes('\t')
      ? line.split('\t').map(c => c.trim())
      : line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

    if (cells.length === 0) continue;

    // Mapping order heuristic:
    // Cell 0: SKU (if missing, auto-generate)
    // Cell 1: Name
    // Cell 2: Category
    // Cell 3: Cost Price
    // Cell 4: Selling Price
    // Cell 5: Quantity
    // Cell 6: Unit
    // Cell 7: Location
    // Cell 8: Shelf

    let rawSku = cells[0] || '';
    let name = cells[1] || '';

    // If first cell doesn't look like SKU (e.g. long string) and cell 1 is empty
    if (!name && rawSku) {
      name = rawSku;
      rawSku = '';
    }

    if (!name) continue; // Name is required

    const category = cells[2] || defaultSectorConfig.categories[0] || 'General';
    const costPrice = parseFloat(cells[3]) || 0;
    const sellingPrice = parseFloat(cells[4]) || Math.round(costPrice * 1.5 * 100) / 100 || 10;
    const quantity = parseInt(cells[5], 10) || 10;
    const unit = cells[6] || defaultSectorConfig.defaultUnit || 'pcs';
    const location = cells[7] || defaultSectorConfig.locationSuggestions[0] || 'Main Warehouse';
    const shelf = cells[8] || defaultSectorConfig.shelfSuggestions[0] || 'Shelf 01';

    const sku = rawSku || `SKU-${defaultSectorConfig.sectorKey.toUpperCase().substring(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Check SKU Exact Duplicate Conflict with existing products
    const existingSkuMatch = existingProducts.find(p => p.sku.toLowerCase() === sku.toLowerCase());

    // 2. Check Fuzzy Name Similarity with existing products
    let bestSimilarityMatch: { existingProduct: Product; percentage: number; matchedTokens: string[] } | undefined = undefined;

    for (const p of existingProducts) {
      const match = calculateProductSimilarity(name, p.name);
      if (match.isSimilar) {
        if (!bestSimilarityMatch || match.percentage > bestSimilarityMatch.percentage) {
          bestSimilarityMatch = {
            existingProduct: p,
            percentage: match.percentage,
            matchedTokens: match.matchedTokens
          };
        }
      }
    }

    // Default Action assignment
    let defaultAction: 'IMPORT_NEW' | 'MERGE_STOCK' | 'OVERWRITE' | 'SKIP' = 'IMPORT_NEW';
    if (existingSkuMatch) {
      defaultAction = 'MERGE_STOCK'; // Default to merge or prompt user to resolve SKU duplicate
    } else if (bestSimilarityMatch) {
      defaultAction = 'MERGE_STOCK'; // Default to merge stock if similar item found!
    }

    results.push({
      id: `import_row_${i}_${Math.random().toString(36).substring(2, 6)}`,
      sku,
      name,
      category,
      costPrice,
      sellingPrice,
      unit,
      location,
      shelf,
      reorderLevel: 5,
      quantity,
      skuConflict: !!existingSkuMatch,
      skuMatchExistingProduct: existingSkuMatch,
      similarityMatch: bestSimilarityMatch,
      action: defaultAction,
      assignedSku: sku
    });
  }

  return results;
}
