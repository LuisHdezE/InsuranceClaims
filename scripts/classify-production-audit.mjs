import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const [reportPath = '.runtime/npm-audit-production.json', summaryPath = '.runtime/npm-audit-production-summary.json', gate = 'production-dependencies'] = process.argv.slice(2);

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const counts = report?.metadata?.vulnerabilities;

if (!counts || typeof counts !== 'object') {
  console.error('Production dependency audit is not classifiable: npm audit returned no metadata.vulnerabilities object.');
  if (report?.error) console.error(JSON.stringify(report.error));
  process.exit(2);
}

const normalize = (value) => Number.isInteger(value) && value >= 0 ? value : 0;
const vulnerabilities = {
  info: normalize(counts.info),
  low: normalize(counts.low),
  moderate: normalize(counts.moderate),
  high: normalize(counts.high),
  critical: normalize(counts.critical),
  total: normalize(counts.total),
};

const blockingPackages = Object.entries(report.vulnerabilities ?? {})
  .filter(([, value]) => ['high', 'critical'].includes(value?.severity))
  .map(([name, value]) => ({
    name,
    severity: value.severity,
    direct: value.isDirect === true,
    range: value.range ?? null,
    fixAvailable: value.fixAvailable ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

let candidateSha = null;
try {
  candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Local callers outside a Git worktree can still classify a report.
}

const summary = {
  schemaVersion: '1.0',
  event: 'PRODUCTION_DEPENDENCY_AUDIT',
  gate,
  candidateSha,
  auditReportVersion: report.auditReportVersion ?? null,
  vulnerabilities,
  blockingPackages,
  decision: vulnerabilities.high > 0 || vulnerabilities.critical > 0 ? 'BLOCK' : 'PASS',
};

await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));

if (summary.decision === 'BLOCK') {
  console.error(`High or critical production dependency advisories block ${gate}.`);
  process.exit(1);
}
