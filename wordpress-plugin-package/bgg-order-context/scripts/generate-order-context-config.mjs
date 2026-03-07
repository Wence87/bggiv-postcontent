import fs from 'fs';
import path from 'path';

function parseSemicolonCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ';') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\r') {
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function clean(v) {
  if (v == null) return '';
  return String(v).trim();
}

function keyify(v) {
  return clean(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function parseProducts(rows) {
  const header = rows[0] || [];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => clean(c) !== ''));

  const idx = {
    displayName: header.findIndex((h) => clean(h).toLowerCase().includes('nom produit affich')),
    sku: header.findIndex((h) => clean(h).toLowerCase() === 'sku'),
    internalSlug: header.findIndex((h) => clean(h).toLowerCase().includes('type interne produit')),
    formId: header.findIndex((h) => clean(h).toLowerCase().includes('formulaire cible')),
    baseFields: header.findIndex((h) => clean(h).toLowerCase().includes('champs de base')),
    notes: header.findIndex((h) => clean(h).toLowerCase().includes('remarques')),
  };

  return dataRows.map((r) => {
    const displayName = clean(r[idx.displayName]);
    const internalSlug = clean(r[idx.internalSlug]);
    let productType = 'news';
    if (internalSlug.includes('sponsorship')) productType = 'sponsorship';
    else if (internalSlug.includes('advertising') || internalSlug.includes('ad')) productType = 'ads';
    else if (internalSlug.includes('promo')) productType = 'promo';
    else if (internalSlug.includes('giveaway')) productType = 'giveaway';
    else if (internalSlug.includes('news')) productType = 'news';

    return {
      display_name: displayName,
      product_key: keyify(displayName),
      sku: clean(r[idx.sku]),
      internal_slug: internalSlug,
      product_type: productType,
      form_id: clean(r[idx.formId]),
      base_fields: clean(r[idx.baseFields])
        .split(',')
        .map((x) => clean(x))
        .filter(Boolean),
      notes: clean(r[idx.notes]),
      options: [],
    };
  });
}

function parseOptions(rows) {
  // find real header row that starts with Produit concerné
  const headerRowIndex = rows.findIndex((r) => clean(r[0]).toLowerCase() === 'produit concerné');
  if (headerRowIndex < 0) return [];
  const header = rows[headerRowIndex];

  const idx = {
    productName: 0,
    optionName: 1,
    businessType: 2,
    purchasedRaw: 3,
    possibleValues: 4,
    deriveRule: 5,
    asksInfo: 6,
    collectInfo: 7,
    fieldsCount: 8,
    fieldType: 9,
    required: 10,
    businessRule: 11,
    slug: 12,
    wcRawExample: 13,
    baseValue: 14,
    purchasedValue: 15,
    paidAdditional: 16,
    finalValue: 17,
    blockName: 18,
    displayCondition: 19,
    blockFields: 20,
    validation: 21,
    optionKey: 22,
  };

  return rows
    .slice(headerRowIndex + 1)
    .filter((r) => clean(r[idx.productName]) !== '' && clean(r[idx.optionKey]) !== '')
    .map((r) => ({
      product_name: clean(r[idx.productName]),
      option_name: clean(r[idx.optionName]),
      option_key: clean(r[idx.optionKey]),
      technical_slug: clean(r[idx.slug]),
      business_type: clean(r[idx.businessType]),
      purchased_raw: clean(r[idx.purchasedRaw]),
      possible_values: clean(r[idx.possibleValues]),
      derive_rule: clean(r[idx.deriveRule]),
      asks_additional_info: ['oui', 'yes', 'true'].includes(clean(r[idx.asksInfo]).toLowerCase()),
      collect_info: clean(r[idx.collectInfo]),
      fields_count: clean(r[idx.fieldsCount]),
      field_type: clean(r[idx.fieldType]),
      required: clean(r[idx.required]),
      business_rule: clean(r[idx.businessRule]),
      wc_raw_example: clean(r[idx.wcRawExample]),
      values: {
        base_included: clean(r[idx.baseValue]),
        purchased: clean(r[idx.purchasedValue]),
        paid_additional: clean(r[idx.paidAdditional]),
        final: clean(r[idx.finalValue]),
      },
      activated_block: clean(r[idx.blockName]),
      display_condition: clean(r[idx.displayCondition]),
      block_fields: clean(r[idx.blockFields]),
      validation: clean(r[idx.validation]),
    }));
}

function buildDerivedRule(option) {
  const k = option.option_key.toLowerCase();
  const n = option.option_name.toLowerCase();
  const d = option.derive_rule.toLowerCase();
  if (k.includes('duration') || n.includes('duration') || d.includes('durée') || d.includes('duration')) {
    return {
      type: 'duration_weeks',
      included: option.values.base_included || '1',
      purchased: option.values.purchased || null,
      paid_additional: option.values.paid_additional || null,
      final: option.values.final || null,
    };
  }
  return null;
}

function buildConfig(products, options) {
  const byDisplayName = new Map(products.map((p) => [p.display_name.toLowerCase(), p]));
  for (const option of options) {
    const product = byDisplayName.get(option.product_name.toLowerCase());
    if (!product) continue;

    const normalizedOption = {
      option_key: option.option_key,
      option_name: option.option_name,
      technical_slug: option.technical_slug,
      business_type: option.business_type,
      source: {
        purchased_raw: option.purchased_raw,
        possible_values: option.possible_values,
        wc_raw_example: option.wc_raw_example,
      },
      rules: {
        derive_rule: option.derive_rule,
        asks_additional_info: option.asks_additional_info,
        collect_info: option.collect_info,
        fields_count: option.fields_count,
        field_type: option.field_type,
        required: option.required,
        business_rule: option.business_rule,
        values: option.values,
      },
      activated_block: {
        name: option.activated_block,
        condition: option.display_condition,
        fields: option.block_fields,
        validation: option.validation,
      },
      derived: buildDerivedRule(option),
    };

    product.options.push(normalizedOption);
  }

  const productsByType = {};
  for (const p of products) {
    productsByType[p.product_type] = productsByType[p.product_type] || [];
    productsByType[p.product_type].push(p);
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    products,
    index: {
      by_sku: Object.fromEntries(products.map((p) => [p.sku, p.product_key])),
      by_product_type: Object.fromEntries(Object.entries(productsByType).map(([k, v]) => [k, v.map((x) => x.product_key)])),
    },
  };
}

function loadOverrides(overridesPath) {
  if (!overridesPath) return null;
  if (!fs.existsSync(overridesPath)) return null;
  const raw = fs.readFileSync(overridesPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.products)) return null;
  return parsed;
}

function applyProductOverrides(config, overrides) {
  if (!overrides || !Array.isArray(overrides.products)) return config;

  for (const rule of overrides.products) {
    if (!rule || typeof rule !== 'object') continue;
    const match = rule.match && typeof rule.match === 'object' ? rule.match : {};
    const set = rule.set && typeof rule.set === 'object' ? rule.set : {};

    const product = config.products.find((p) => {
      if (typeof match.sku === 'string' && p.sku === match.sku) return true;
      if (typeof match.product_key === 'string' && p.product_key === match.product_key) return true;
      if (typeof match.display_name === 'string' && p.display_name === match.display_name) return true;
      return false;
    });

    if (!product) continue;
    for (const [k, v] of Object.entries(set)) {
      if (v != null) {
        product[k] = v;
      }
    }
  }

  config.index.by_sku = Object.fromEntries(config.products.map((p) => [p.sku, p.product_key]));
  const grouped = {};
  for (const p of config.products) {
    grouped[p.product_type] = grouped[p.product_type] || [];
    grouped[p.product_type].push(p.product_key);
  }
  config.index.by_product_type = grouped;
  return config;
}

const productsCsvPath = process.argv[2];
const optionsCsvPath = process.argv[3];
const outPath = process.argv[4] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'config', 'order-context.config.json');
const defaultOverridesPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'product-mapping.overrides.json');
const overridesPath = process.argv[5] || (fs.existsSync(defaultOverridesPath) ? defaultOverridesPath : null);

if (!productsCsvPath || !optionsCsvPath) {
  console.error('Usage: node scripts/generate-order-context-config.mjs <products.csv> <options.csv> [output.json]');
  process.exit(1);
}

const productsRows = parseSemicolonCsv(fs.readFileSync(productsCsvPath, 'utf8'));
const optionsRows = parseSemicolonCsv(fs.readFileSync(optionsCsvPath, 'utf8'));
let config = buildConfig(parseProducts(productsRows), parseOptions(optionsRows));
config = applyProductOverrides(config, loadOverrides(overridesPath));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`Wrote config: ${outPath}`);
console.log(`Products: ${config.products.length}`);
console.log(`Options: ${config.products.reduce((sum, p) => sum + p.options.length, 0)}`);
