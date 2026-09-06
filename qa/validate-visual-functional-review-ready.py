#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'documentation/visual-functional-review/generated/visual-functional-review-browser.json'
STATUS = ROOT / '.blueprint/status.yaml'

EXPECTED_SLICES = {
    'digital-claim-intake/web': {
        'artifact': ROOT / '.blueprint/functional-slices/digital-claim-intake.web.json',
        'evidence': 'EVD-VFR-INTAKE-WEB-001',
        'reference': 'PASS',
        'scope_id': 'digital-claim-intake',
        'doc': ROOT / 'documentation/visual-functional-review/DIGITAL_CLAIM_INTAKE_WEB_EVIDENCE.md',
    },
    'customer-claim-tracking/web': {
        'artifact': ROOT / '.blueprint/functional-slices/customer-claim-tracking.web.json',
        'evidence': 'EVD-VFR-TRACKING-WEB-001',
        'reference': 'PASS',
        'scope_id': 'customer-claim-tracking',
        'doc': ROOT / 'documentation/visual-functional-review/CUSTOMER_CLAIM_TRACKING_WEB_EVIDENCE.md',
    },
    'claims-backoffice/web': {
        'artifact': ROOT / '.blueprint/functional-slices/claims-backoffice.web.json',
        'evidence': 'EVD-VFR-BACKOFFICE-WEB-001',
        'reference': 'N/A',
        'scope_id': 'claims-backoffice',
        'doc': ROOT / 'documentation/visual-functional-review/CLAIMS_BACKOFFICE_WEB_EVIDENCE.md',
    },
}

MACHINE_CHECKS = [
    'review.interface_fidelity',
    'review.design_system_fidelity',
    'review.api_permission_fidelity',
    'review.business_data_fidelity',
    'review.interaction_states',
    'review.responsive',
    'review.accessibility',
]


def fail(message: str) -> None:
    print(f'VFR_READY_FAIL: {message}', file=sys.stderr)
    raise SystemExit(1)


if not GENERATED.is_file():
    fail('generated browser evidence is missing')

data = json.loads(GENERATED.read_text(encoding='utf-8'))
summary = data.get('summary', {})
if summary.get('machine_review_ready') is not True:
    fail('machine_review_ready must be true')
if summary.get('human_review_required') is not True:
    fail('human_review_required must be true')
if summary.get('next_status') != 'READY_FOR_REVIEW':
    fail('next_status must be READY_FOR_REVIEW')
if summary.get('screenshot_count') != 12:
    fail('exactly 12 browser screenshots are required')

reviewed_commit = data.get('reviewed_commit')
if not isinstance(reviewed_commit, str) or not re.fullmatch(r'[0-9a-f]{40}', reviewed_commit):
    fail('reviewed_commit must be a full commit SHA')

for slice_id, contract in EXPECTED_SLICES.items():
    machine = data.get('slices', {}).get(slice_id)
    if not machine:
        fail(f'missing generated evidence for {slice_id}')
    if machine.get('machine_review_ready') is not True:
        fail(f'{slice_id} is not machine-review ready')
    checks = machine.get('checks', {})
    for check in MACHINE_CHECKS:
        if checks.get(check) != 'PASS':
            fail(f'{slice_id} {check} must PASS')
    if checks.get('review.reference_comparison') != contract['reference']:
        fail(f'{slice_id} reference comparison mismatch')
    if checks.get('review.human_complete') != 'PENDING_MANUAL':
        fail(f'{slice_id} must remain pending manual human review')
    for screenshot in machine.get('screenshots', []):
        if not (ROOT / screenshot).is_file():
            fail(f'missing screenshot {screenshot}')

    artifact = json.loads(contract['artifact'].read_text(encoding='utf-8'))
    if artifact.get('lifecycle_status') != 'FUNCTIONAL':
        fail(f'{slice_id} lifecycle must remain FUNCTIONAL')
    vfr = artifact.get('visual_functional_review', {})
    if vfr.get('status') != 'READY_FOR_REVIEW':
        fail(f'{slice_id} VFR status must be READY_FOR_REVIEW')
    if vfr.get('human_complete') is not False:
        fail(f'{slice_id} human_complete must remain false')
    expected_ids = {'EVD-VFR-BROWSER-WEB-001', contract['evidence']}
    if set(vfr.get('evidence_ids', [])) != expected_ids:
        fail(f'{slice_id} VFR evidence binding mismatch')
    if artifact.get('integration_qa', {}).get('status') != 'PENDING':
        fail(f'{slice_id} Integration QA must remain PENDING')
    if not contract['doc'].is_file():
        fail(f'{slice_id} scoped evidence document is missing')

status = STATUS.read_text(encoding='utf-8')
required_status_fragments = [
    '  visual_functional_review:\n    status: READY_FOR_REVIEW',
    '  review.interface_fidelity:\n    status: PASS',
    '  review.design_system_fidelity:\n    status: PASS',
    '  review.api_permission_fidelity:\n    status: PASS',
    '  review.business_data_fidelity:\n    status: PASS',
    '  review.interaction_states:\n    status: PASS',
    '  review.responsive:\n    status: PASS',
    '  review.accessibility:\n    status: PASS',
    '  review.reference_comparison:\n    status: PASS',
    '  review.human_complete:\n    status: PENDING',
    'EVD-VFR-BROWSER-WEB-001',
    'EVD-VFR-INTAKE-WEB-001',
    'EVD-VFR-TRACKING-WEB-001',
    'EVD-VFR-BACKOFFICE-WEB-001',
]
for fragment in required_status_fragments:
    if fragment not in status:
        fail(f'status.yaml missing expected fragment: {fragment!r}')

for contract in EXPECTED_SLICES.values():
    pattern = re.compile(
        r'- gate: visual_functional_review_pass\n'
        r'\s+scope: interface_slice_platform\n'
        rf'\s+scope_id: {re.escape(contract["scope_id"])}\n'
        r'\s+platform: web\n'
        r'\s+status: READY_FOR_REVIEW\n'
    )
    if not pattern.search(status):
        fail(f'missing READY_FOR_REVIEW scoped gate for {contract["scope_id"]}/web')

patchers = [
    ROOT / '.github/workflows/patch-vfr-browser-click.yml',
    ROOT / '.github/workflows/patch-vfr-datetime.yml',
    ROOT / '.github/workflows/patch-vfr-diagnostics.yml',
    ROOT / '.github/workflows/patch-vfr-casefold-cleanup.yml',
    ROOT / '.github/workflows/patch-vfr-reviewed-commit.yml',
    ROOT / '.github/workflows/reconcile-vfr-ready.yml',
]
for patcher in patchers:
    if patcher.exists():
        fail(f'temporary workflow still present: {patcher.relative_to(ROOT)}')

print(json.dumps({
    'event': 'VFR_READY_PASS',
    'reviewed_commit': reviewed_commit,
    'slices': list(EXPECTED_SLICES),
    'human_review_required': True,
    'integration_qa_started': False,
}, sort_keys=True))
