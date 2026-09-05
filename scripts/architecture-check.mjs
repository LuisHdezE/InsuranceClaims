import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const violations = [];
async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}
function importSpecifiers(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
}
function rejectImports(file, imports, forbidden) {
  for (const spec of imports) for (const token of forbidden) if (spec === token || spec.startsWith(`${token}/`)) violations.push(`${file}: forbidden import ${spec}`);
}

const domainFiles = await filesUnder('packages/domain');
for (const file of domainFiles) {
  const source = await readFile(join(root, file), 'utf8');
  rejectImports(file, importSpecifiers(source), ['@nestjs', '@prisma', '@modelcontextprotocol', '@insurance/infrastructure', 'node:fs', 'node:http', 'express', 'argon2', 'jose']);
}
const applicationFiles = await filesUnder('packages/application');
for (const file of applicationFiles) {
  const source = await readFile(join(root, file), 'utf8');
  rejectImports(file, importSpecifiers(source), ['@nestjs', '@prisma', '@modelcontextprotocol', '@insurance/infrastructure', 'node:fs', 'node:http', 'express', 'argon2', 'jose']);
}
const controllerFiles = ['apps/api/src/controllers.ts', 'apps/api/src/auth.guard.ts', 'apps/api/src/transport.ts'];
for (const file of controllerFiles) {
  const source = await readFile(join(root, file), 'utf8');
  rejectImports(file, importSpecifiers(source), ['@prisma', '@insurance/infrastructure']);
}
const mcp = await readFile(join(root, 'apps/mcp/src/main.ts'), 'utf8');
rejectImports('apps/mcp/src/main.ts', importSpecifiers(mcp), ['@prisma']);
for (const top of ['apps', 'packages']) {
  for (const file of await filesUnder(top)) {
    const source = await readFile(join(root, file), 'utf8');
    if ((source.includes('policy_no') || source.includes('active_flag')) && !file.startsWith('packages/infrastructure/') && !file.startsWith('apps/legacy-simulator/')) {
      violations.push(`${file}: simulated legacy wire DTO leaked outside Infrastructure/simulator`);
    }
  }
}
const domainSource = await readFile(join(root, 'packages/domain/src/index.ts'), 'utf8');
if (!domainSource.includes('transition(toStatus') || !domainSource.includes('allowedTransitionsFor')) violations.push('Domain does not visibly own lifecycle transition legality.');
if (violations.length) {
  console.error('Architecture conformance FAILED');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}
console.log('Architecture conformance PASS');
console.log(`Checked ${domainFiles.length} Domain file(s), ${applicationFiles.length} Application file(s), REST Presentation, MCP Presentation and legacy DTO boundaries.`);
