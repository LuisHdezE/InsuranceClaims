import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const designSystem = readJson('.blueprint/ui/design-system.json');
const tokens = readJson('.blueprint/ui/design-tokens.json');
const inventory = readJson('.blueprint/ui/interface-inventory.json');

const logoPath = '.blueprint/ui/assets/far-seguros-logo.svg';
const landingReferencePath = '.blueprint/ui/references/far-public-landing-approved.md';
const landingReference = exists(landingReferencePath) ? readText(landingReferencePath) : '';

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const requiredSemanticStates = [
  'default', 'loading', 'empty', 'filtered_empty', 'success', 'error', 'offline',
  'forbidden', 'validation', 'conflict', 'rate_limit', '401', '403', '404', '409', '422', '429'
];

const requiredComponents = [
  'Public header',
  'Public hero',
  'Public quick-action card',
  'Public trust feature',
  'Case-study disclaimer',
  'Operator app shell',
  'Primary button',
  'Text input',
  'File upload',
  'Validation summary',
  'Status badge',
  'Problem state',
  'Claim summary',
  'Tracking code block',
  'Claim timeline',
  'Evidence list',
  'Claims table/list',
  'Confirmation dialog'
];

const lifecycleStates = ['RECEIVED', 'UNDER_REVIEW', 'OBSERVED', 'APPROVED', 'IN_REPAIR', 'CLOSED'];

assert(designSystem.schema_version === '0.5.0', 'design-system schema_version must be 0.5.0');
assert(tokens.schema_version === '0.5.0', 'design-tokens schema_version must be 0.5.0');
assert(designSystem.tokens_path === '.blueprint/ui/design-tokens.json', 'tokens_path must point to canonical design tokens');
assert(designSystem.identity?.logo_required === true, 'FAR visual identity requires logo_required=true');
assert(designSystem.identity?.logo_path === logoPath, `logo_path must be ${logoPath}`);
assert(exists(logoPath), `versioned FAR logo asset is missing: ${logoPath}`);
assert(exists(landingReferencePath), `approved public landing reference manifest is missing: ${landingReferencePath}`);
assert(landingReference.includes('HUMAN APPROVED VISUAL GUIDE'), 'landing reference must preserve explicit human-approved status');
assert(landingReference.includes('not a functional requirements source'), 'landing reference must preserve the functional-scope guardrail');
assert(landingReference.includes('No affiliation with FAR Seguros'), 'landing reference must preserve the no-affiliation disclosure');
assert(typeof designSystem.identity?.direction === 'string' && designSystem.identity.direction.length > 40, 'design direction must explicitly describe FAR identity modernization');

for (const key of ['brand', 'surface', 'text', 'semantic']) {
  assert(tokens.colors?.[key] && typeof tokens.colors[key] === 'object', `missing colors.${key}`);
}
for (const key of ['info', 'success', 'warning', 'danger', 'neutral']) {
  assert(typeof tokens.colors?.semantic?.[key] === 'string', `missing semantic color ${key}`);
}

const expectedBrand = {
  primary: '#00BED8',
  primary_strong: '#006B78',
  accent: '#FEF200',
  ink: '#221E1F',
  focus: '#005FCC'
};
for (const [key, expected] of Object.entries(expectedBrand)) {
  assert(tokens.colors?.brand?.[key]?.toUpperCase() === expected, `brand.${key} must preserve ${expected}`);
}

assert(tokens.accessibility?.target === 'WCAG 2.2 AA', 'accessibility target must be WCAG 2.2 AA');
assert((tokens.accessibility?.minimum_touch_target_px ?? 0) >= 44, 'minimum touch target must be >= 44px');
assert((tokens.accessibility?.minimum_text_contrast_ratio ?? 0) >= 4.5, 'minimum text contrast target must be >= 4.5:1');
assert(designSystem.accessibility?.target === 'WCAG 2.2 AA', 'design system accessibility target must be WCAG 2.2 AA');
assert(designSystem.accessibility?.keyboard === true, 'keyboard support must be required');
assert(designSystem.accessibility?.focus === true, 'visible focus must be required');
assert(designSystem.accessibility?.color_not_only_signal === true, 'color cannot be the only signal');

const mobileMax = tokens.breakpoints?.mobile_max;
const tabletMin = tokens.breakpoints?.tablet_min;
const desktopMin = tokens.breakpoints?.desktop_min;
assert(Number.isInteger(mobileMax) && mobileMax >= 320, 'mobile_max must be a valid viewport breakpoint');
assert(Number.isInteger(tabletMin) && tabletMin === mobileMax + 1, 'tablet_min must immediately follow mobile_max');
assert(Number.isInteger(desktopMin) && desktopMin > tabletMin, 'desktop_min must be greater than tablet_min');

for (const state of requiredSemanticStates) {
  assert(typeof designSystem.semantic_states?.[state] === 'string' && designSystem.semantic_states[state].length > 8,
    `missing semantic state contract: ${state}`);
}

const componentNames = new Set();
for (const component of designSystem.components ?? []) {
  assert(typeof component.name === 'string' && component.name.length > 0, 'component name is required');
  assert(!componentNames.has(component.name), `duplicate component: ${component.name}`);
  componentNames.add(component.name);
}
for (const componentName of requiredComponents) {
  assert(componentNames.has(componentName), `missing required reusable component: ${componentName}`);
}

const publicHero = (designSystem.components ?? []).find((component) => component.name === 'Public hero');
assert(publicHero?.notes?.includes('WEB-001'), 'Public hero must remain explicitly bound to WEB-001');
assert(publicHero?.notes?.includes('cannot create capabilities'), 'Public hero must preserve the no-invented-capability rule');

const operatorShell = (designSystem.components ?? []).find((component) => component.name === 'Operator app shell');
assert(operatorShell?.notes?.includes('operational'), 'Operator app shell must be explicitly operational rather than marketing-oriented');

const disclaimer = (designSystem.components ?? []).find((component) => component.name === 'Case-study disclaimer');
assert(disclaimer?.notes?.includes('no FAR affiliation'), 'Case-study disclaimer must explicitly preserve no-affiliation meaning');

const statusBadge = (designSystem.components ?? []).find((component) => component.name === 'Status badge');
for (const status of lifecycleStates) {
  assert(statusBadge?.states?.includes(status), `Status badge must support lifecycle state ${status}`);
}

assert(Array.isArray(inventory.items) && inventory.items.length === 10, 'executable interface inventory must contain exactly 10 items');
for (const item of inventory.items ?? []) {
  assert(item.platform === 'web', `${item.id}: only web interfaces are expected`);
  assert(typeof item.responsive === 'string' && item.responsive.length > 20, `${item.id}: responsive contract is missing`);
  assert(Array.isArray(item.accessibility) && item.accessibility.length > 0, `${item.id}: accessibility obligations are missing`);
  for (const state of item.states ?? []) {
    assert(Object.hasOwn(designSystem.semantic_states, state), `${item.id}: state ${state} is not represented by the Design System`);
  }
}

function relativeLuminance(hex) {
  const normalized = hex.replace('#', '');
  const rgb = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const channels = rgb.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const lightSurfaces = [tokens.colors.surface.primary, tokens.colors.surface.canvas];
const accessibleForegrounds = {
  'text.primary': tokens.colors.text.primary,
  'text.secondary': tokens.colors.text.secondary,
  'text.muted': tokens.colors.text.muted,
  'brand.primary_strong': tokens.colors.brand.primary_strong,
  'brand.focus': tokens.colors.brand.focus,
  'semantic.info': tokens.colors.semantic.info,
  'semantic.success': tokens.colors.semantic.success,
  'semantic.warning': tokens.colors.semantic.warning,
  'semantic.danger': tokens.colors.semantic.danger,
  'semantic.neutral': tokens.colors.semantic.neutral
};

for (const [name, foreground] of Object.entries(accessibleForegrounds)) {
  for (const background of lightSurfaces) {
    const ratio = contrastRatio(foreground, background);
    assert(ratio >= 4.5, `${name} contrast ${ratio.toFixed(2)}:1 against ${background} is below 4.5:1`);
  }
}

const inkOnCyan = contrastRatio(tokens.colors.brand.ink, tokens.colors.brand.primary);
const inkOnYellow = contrastRatio(tokens.colors.brand.ink, tokens.colors.brand.accent);
assert(inkOnCyan >= 4.5, `brand.ink contrast ${inkOnCyan.toFixed(2)}:1 on FAR cyan is below 4.5:1`);
assert(inkOnYellow >= 4.5, `brand.ink contrast ${inkOnYellow.toFixed(2)}:1 on FAR yellow is below 4.5:1`);

if (errors.length > 0) {
  console.error('Design System validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Design System validation PASS');
console.log(`- inventory interfaces: ${inventory.items.length}/10`);
console.log(`- reusable components: ${designSystem.components.length}`);
console.log(`- semantic states: ${Object.keys(designSystem.semantic_states).length}`);
console.log('- visual identity/logo: APPLICABLE / PASS');
console.log('- FAR core brand colors: preserved');
console.log('- public/admin experience separation: asserted');
console.log('- approved public landing reference guardrail: asserted');
console.log('- WCAG text/brand pairing contrast checks: PASS');
