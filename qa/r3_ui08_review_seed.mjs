import fs from 'node:fs';

const base = process.env.QA_BASE_URL.replace(/\/$/, '');
const reviewDir = process.env.REVIEW_DIR;

async function request(method, path, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  if (!text) return null;
  const parsed = JSON.parse(text);
  return parsed?.data ?? parsed;
}

const auth = await request('POST', '/api/v1/operator/auth/login', {
  login: process.env.QA_ADMIN_LOGIN,
  password: process.env.QA_OPERATOR_PASSWORD,
});
if (auth.operator?.role !== 'PLATFORM_ADMIN') throw new Error(`Expected PLATFORM_ADMIN, got ${auth.operator?.role}`);
const token = auth.accessToken;
if (!token) throw new Error('Admin login did not return an access token.');

async function activateAndEnable(basePath, definition) {
  const draft = definition.versions.find((version) => version.status === 'DRAFT');
  if (!draft) throw new Error(`No DRAFT returned from ${basePath}`);
  definition = await request(
    'POST',
    `${basePath}/${definition.definitionId}/versions/${draft.versionId}/activate`,
    { expectedDefinitionVersion: definition.version },
    token,
  );
  if (definition.enabled) throw new Error(`${basePath}: definition enabled during activation; activation and enable must remain separate.`);
  definition = await request(
    'PATCH',
    `${basePath}/${definition.definitionId}`,
    { expectedDefinitionVersion: definition.version, enabled: true },
    token,
  );
  if (!definition.enabled) throw new Error(`${basePath}: enable did not persist.`);
  return definition;
}

let automation = await request('POST', '/api/v1/admin/automations', {
  key: 'qa.claim.initial.review',
  displayName: 'Revisión inicial de siniestro QA',
  sourceClassification: 'SYNTHETIC_QA',
  content: {
    when: { eventType: 'CLAIM_CREATED' },
    if: [{ field: 'claim.status', operator: 'EQ', value: 'RECEIVED' }],
    wait: { delaySeconds: 300 },
    then: [
      { key: 'create_initial_review', type: 'CREATE_TASK', parameters: { taskType: 'CLAIM_REVIEW', priority: 'NORMAL' } },
      { key: 'notify_operator', type: 'NOTIFY_OPERATOR', parameters: { messageKey: 'QA_INITIAL_REVIEW' } },
    ],
  },
}, token);
if (automation.enabled || automation.versions[0]?.status !== 'DRAFT') throw new Error('Automation create contract drifted.');
automation = await activateAndEnable('/api/v1/admin/automations', automation);

await request('POST', '/api/v1/admin/automations', {
  key: 'qa.claim.scheduled.check',
  displayName: 'Control programado QA',
  sourceClassification: 'SYNTHETIC_QA',
  content: {
    when: { eventType: 'SCHEDULED_CHECK' },
    if: [],
    wait: null,
    then: [{ key: 'notify_review', type: 'NOTIFY_OPERATOR', parameters: { messageKey: 'QA_SCHEDULED_CHECK' } }],
  },
}, token);

let pipeline = await request('POST', '/api/v1/admin/pipelines', {
  key: 'qa.claim.standard.flow',
  consumerType: 'CLAIM',
  displayName: 'Flujo estándar de siniestros QA',
  sourceClassification: 'SYNTHETIC_QA',
  stages: [
    { stageKey: 'RECEIVED', displayName: 'Recibido', sortOrder: 1, allowedNextStageKeys: ['UNDER_REVIEW'], reportingFlags: { intake: true } },
    { stageKey: 'UNDER_REVIEW', displayName: 'En revisión', sortOrder: 2, allowedNextStageKeys: ['RESOLVED'], reportingFlags: { workInProgress: true } },
    { stageKey: 'RESOLVED', displayName: 'Resuelto', sortOrder: 3, allowedNextStageKeys: [], reportingFlags: { terminal: true } },
  ],
}, token);
if (pipeline.enabled || pipeline.versions[0]?.status !== 'DRAFT') throw new Error('Pipeline create contract drifted.');
pipeline = await activateAndEnable('/api/v1/admin/pipelines', pipeline);

await request('POST', '/api/v1/admin/pipelines', {
  key: 'qa.renewal.review.flow',
  consumerType: 'RENEWAL',
  displayName: 'Revisión de renovaciones QA',
  sourceClassification: 'SYNTHETIC_QA',
  stages: [
    { stageKey: 'PENDING_REVIEW', displayName: 'Pendiente', sortOrder: 1, allowedNextStageKeys: ['REVIEWED'], reportingFlags: { pending: true } },
    { stageKey: 'REVIEWED', displayName: 'Revisada', sortOrder: 2, allowedNextStageKeys: [], reportingFlags: { terminal: true } },
  ],
}, token);

const seed = {
  automationDefinitionId: automation.definitionId,
  automationDisplayName: automation.displayName,
  pipelineDefinitionId: pipeline.definitionId,
  pipelineDisplayName: pipeline.displayName,
  role: auth.operator.role,
};
fs.writeFileSync(`${reviewDir}/seed.json`, JSON.stringify(seed, null, 2));
console.log(JSON.stringify({ event: 'R3_UI08_REAL_API_SEED_PASS', ...seed }));
