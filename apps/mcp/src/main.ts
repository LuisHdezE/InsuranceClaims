import { createServer } from 'node:http';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { ApplicationError } from '@insurance/application';
import { createProductionRuntimeFromEnv } from '@insurance/infrastructure';

const runtime = await createProductionRuntimeFromEnv();
const port = Number(process.env.MCP_PORT ?? 3100);
const allowedOrigins = new Set((process.env.MCP_ALLOWED_ORIGINS ?? `http://localhost:${port},http://127.0.0.1:${port}`).split(',').map((value) => value.trim()).filter(Boolean));

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'insurance-claims-mvp', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.registerTool('get_claim_status', {
    description: 'Return customer-safe synthetic claim status using tracking code plus synthetic policy reference.',
    inputSchema: z.object({ trackingCode: z.string().min(1).max(80), policyReference: z.string().min(1).max(80) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ trackingCode, policyReference }) => {
    try {
      const result = await runtime.application.getClaimStatusForMcp({ trackingCode, policyReference });
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const safe = error instanceof ApplicationError && error.code === 'CLAIM_NOT_FOUND' ? 'Claim could not be found.' : 'Claim status is temporarily unavailable.';
      return { content: [{ type: 'text', text: safe }], isError: true };
    }
  });
  return server;
});
const nodeHandler = toNodeHandler(handler);

createServer((req, res) => {
  if (req.url !== '/mcp') { res.statusCode = 404; res.end('Not found'); return; }
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) { res.statusCode = 403; res.end('Origin not allowed'); return; }
  const host = req.headers.host ?? '';
  if (!host.startsWith('localhost:') && !host.startsWith('127.0.0.1:') && process.env.MCP_ALLOW_REMOTE_HOST !== 'true') {
    res.statusCode = 403; res.end('Host not allowed'); return;
  }
  nodeHandler(req, res);
}).listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'MCP_LISTENING', port })));
