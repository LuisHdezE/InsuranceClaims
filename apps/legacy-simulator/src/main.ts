import { createServer } from 'node:http';

const port = Number(process.env.LEGACY_SIMULATOR_PORT ?? 3200);
const records = new Map([
  ['SYN-POL-001|SYN-VEH-001', { holder_label: 'Synthetic Customer A', active_flag: 'Y' }],
  ['SYN-POL-002|SYN-VEH-002', { holder_label: 'Synthetic Customer B', active_flag: 'Y' }],
  ['SYN-POL-003|SYN-VEH-003', { holder_label: 'Synthetic Customer C', active_flag: 'N' }],
]);

createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/legacy/v1/policy-vehicle/verify') { res.statusCode = 404; res.end(); return; }
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { raw += chunk; if (raw.length > 64 * 1024) req.destroy(); });
  req.on('end', () => {
    try {
      const body = JSON.parse(raw) as { policy_no?: unknown; vehicle_ref?: unknown };
      const policy_no = typeof body.policy_no === 'string' ? body.policy_no : '';
      const vehicle_ref = typeof body.vehicle_ref === 'string' ? body.vehicle_ref : '';
      const record = records.get(`${policy_no}|${vehicle_ref}`);
      const response = {
        policy_no,
        vehicle_ref,
        matched_flag: record ? 'Y' : 'N',
        active_flag: record?.active_flag ?? 'N',
        holder_label: record?.holder_label ?? null,
        system_label: 'SIMULATED LEGACY SYSTEM',
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'malformed_request', system_label: 'SIMULATED LEGACY SYSTEM' }));
    }
  });
}).listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'SIMULATED_LEGACY_SYSTEM_LISTENING', port })));
