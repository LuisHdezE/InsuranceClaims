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
        'approval': 'EVD-VFR-INTAKE-WEB-APPROVAL-001',
        'reference': 'PASS',
        'scope_id': 'digital-claim-intake',
        'doc': ROOT / 'documentation/visual-functional-review/DIGITAL_CLAIM_INTAKE_WEB_EVIDENCE.md',
        'approval_doc': ROOT / 'documentation/visual-functional-review/DIGITAL_CLAIM_INTAKE_WEB_APPROVAL.md',
    },
    'customer-claim-tracking/web': {
        'artifact': ROOT / '.blueprint/functional-slices/customer-claim-tracking.web.json',
        'evidence': 'EVD-VFR-TRACKING-WEB-001',
        'approval': 'EVD-VFR-TRACKING-WEB-APPROVAL-001',
        'reference': 'PASS',
        'scope_id': 'customer-claim-tracking',
        'doc': ROOT / 'documentation/visual-functional-review/CUSTOMER_CLAIM_TRACKING_WEB_EVIDENCE.md',
        'approval_doc': ROOT / 'documentation/visual-functional-review/CUSTOMER_CLAIM_TRACKING_WEB_APPROVAL.md',
    },
    'claims-backoffice/web': {
        'artifact': ROOT / '.blueprint/functional-slices/claims-backoffice.web.json',
        'evidence': 'EVD-VFR-BACKOFFICE-WEB-001',
        'approval': 'EVD-VFR-BACKOFFICE-WEB-APPROVAL-001',
        'reference': 'N/A',
        'scope_id': 'claims-backoffice',
        'doc': ROOT / 'documentation/visual-functional-review/CLAIMS_BACKOFFICE_WEB_EVIDENCE.md',
        'approval_doc': ROOT / 'documentation/visual-functional-review/DIGITAL_CLAIM_INTAKE_WEB_APPROVAL.md',
    },
}
# Correct the backoffice approval path separately to keep the contract table readable.
EXPECTED_SLICES['claims-backoffice/web']['approval_doc'] = ROOT / 'documentation/visual-functional-review/CLAIMS_BACKOFFICE_WEB_APPROVAL.md'

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
    fail('human_review_required must be true in immutable machine evidence')
if summary.get('next_status') != 'READY_FOR_REVIEW':
    fail('machine evidence next_status must remain READY_FOR_REVIEW')
if summary.get('screenshot_count') != 12:
    fail('exactly 12 browser screenshots are required')

reviewed_commit = data.get('reviewed_commit')
if not isinstance(reviewed_commit, str) or not re.fullmatch(r'[0-9a-f]{40}', reviewed_commit):
    fail('reviewed_commit must be a full commit SHA')

slice_states = set()
integration_states = set()
acceptance_states = set()
lifecycle_states = set()

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
        fail(f'{slice_id} immutable machine evidence must preserve PENDING_MANUAL')
    for screenshot in machine.get('screenshots', []):
        if not (ROOT / screenshot).is_file():
            fail(f'missing screenshot {screenshot}')

    artifact = json.loads(contract['artifact'].read_text(encoding='utf-8'))
    lifecycle = artifact.get('lifecycle_status')
    lifecycle_states.add(lifecycle)
    vfr = artifact.get('visual_functional_review', {})
    state = vfr.get('status')
    slice_states.add(state)
    if state not in {'READY_FOR_REVIEW', 'PASS'}:
        fail(f'{slice_id} VFR status must be READY_FOR_REVIEW or PASS')

    base_ids = {'EVD-VFR-BROWSER-WEB-001', contract['evidence']}
    actual_ids = set(vfr.get('evidence_ids', []))
    if state == 'READY_FOR_REVIEW':
        if lifecycle != 'FUNCTIONAL':
            fail(f'{slice_id} lifecycle must remain FUNCTIONAL while VFR awaits approval')
        if vfr.get('human_complete') is not False:
            fail(f'{slice_id} READY_FOR_REVIEW must have human_complete=false')
        if actual_ids != base_ids:
            fail(f'{slice_id} READY_FOR_REVIEW evidence binding mismatch')
    else:
        if lifecycle not in {'FUNCTIONAL', 'ACCEPTED'}:
            fail(f'{slice_id} approved VFR requires lifecycle FUNCTIONAL or ACCEPTED')
        if vfr.get('human_complete') is not True:
            fail(f'{slice_id} PASS must have human_complete=true')
        if actual_ids != base_ids | {contract["approval"]}:
            fail(f'{slice_id} PASS evidence binding must include human approval')
        if not contract['approval_doc'].is_file():
            fail(f'{slice_id} PASS is missing its human approval document')

    integration_state = artifact.get('integration_qa', {}).get('status')
    acceptance_state = artifact.get('human_acceptance', {}).get('status')
    integration_states.add(integration_state)
    acceptance_states.add(acceptance_state)

    if state == 'READY_FOR_REVIEW':
        if integration_state != 'PENDING':
            fail(f'{slice_id} Integration QA must remain PENDING until VFR passes')
        if acceptance_state != 'PENDING':
            fail(f'{slice_id} Human Acceptance must remain PENDING until VFR passes')
    else:
        if integration_state not in {'PENDING', 'READY_FOR_REVIEW', 'PASS'}:
            fail(f'{slice_id} approved VFR has invalid downstream Integration QA state {integration_state!r}')
        if acceptance_state not in {'PENDING', 'PASS'}:
            fail(f'{slice_id} approved VFR has invalid Human Acceptance state {acceptance_state!r}')
        if integration_state != 'PASS' and acceptance_state != 'PENDING':
            fail(f'{slice_id} Human Acceptance cannot pass before Integration QA passes')
        if lifecycle == 'ACCEPTED' and not (integration_state == 'PASS' and acceptance_state == 'PASS'):
            fail(f'{slice_id} ACCEPTED lifecycle requires PASS Integration QA and Human Acceptance')
        if lifecycle == 'FUNCTIONAL' and acceptance_state == 'PASS':
            fail(f'{slice_id} Human Acceptance PASS requires lifecycle ACCEPTED')

    if not contract['doc'].is_file():
        fail(f'{slice_id} scoped evidence document is missing')

if len(slice_states) != 1:
    fail('all three slices must be reconciled to the same VFR gate state')
expected_gate_state = next(iter(slice_states))
human_approved = expected_gate_state == 'PASS'

status = STATUS.read_text(encoding='utf-8')
phase_state = 'COMPLETE' if human_approved else 'READY_FOR_REVIEW'
human_check = 'PASS' if human_approved else 'PENDING'
required_status_fragments = [
    f'  visual_functional_review:\n    status: {phase_state}',
    '  review.interface_fidelity:\n    status: PASS',
    '  review.design_system_fidelity:\n    status: PASS',
    '  review.api_permission_fidelity:\n    status: PASS',
    '  review.business_data_fidelity:\n    status: PASS',
    '  review.interaction_states:\n    status: PASS',
    '  review.responsive:\n    status: PASS',
    '  review.accessibility:\n    status: PASS',
    '  review.reference_comparison:\n    status: PASS',
    f'  review.human_complete:\n    status: {human_check}',
    'EVD-VFR-BROWSER-WEB-001',
    'EVD-VFR-INTAKE-WEB-001',
    'EVD-VFR-TRACKING-WEB-001',
    'EVD-VFR-BACKOFFICE-WEB-001',
]
if human_approved:
    required_status_fragments.extend([
        'EVD-VFR-INTAKE-WEB-APPROVAL-001',
        'EVD-VFR-TRACKING-WEB-APPROVAL-001',
        'EVD-VFR-BACKOFFICE-WEB-APPROVAL-001',
    ])
for fragment in required_status_fragments:
    if fragment not in status:
        fail(f'status.yaml missing expected fragment: {fragment!r}')

for contract in EXPECTED_SLICES.values():
    pattern = re.compile(
        r'- gate: visual_functional_review_pass\n'
        r'\s+scope: interface_slice_platform\n'
        rf'\s+scope_id: {re.escape(contract["scope_id"])}\n'
        r'\s+platform: web\n'
        rf'\s+status: {expected_gate_state}\n'
    )
    if not pattern.search(status):
        fail(f'missing {expected_gate_state} scoped gate for {contract["scope_id"]}/web')

patchers = [
    ROOT / '.github/workflows/patch-vfr-browser-click.yml',
    ROOT / '.github/workflows/patch-vfr-datetime.yml',
    ROOT / '.github/workflows/patch-vfr-diagnostics.yml',
    ROOT / '.github/workflows/patch-vfr-casefold-cleanup.yml',
    ROOT / '.github/workflows/patch-vfr-reviewed-commit.yml',
    ROOT / '.github/workflows/reconcile-vfr-ready.yml',
    ROOT / '.github/workflows/reconcile-vfr-approval.yml',
]
for patcher in patchers:
    if patcher.exists():
        fail(f'temporary workflow still present: {patcher.relative_to(ROOT)}')

print(json.dumps({
    'event': 'VFR_PASS' if human_approved else 'VFR_READY_PASS',
    'reviewed_commit': reviewed_commit,
    'slices': list(EXPECTED_SLICES),
    'human_review_complete': human_approved,
    'integration_qa_started': any(state != 'PENDING' for state in integration_states),
    'human_acceptance_complete': all(state == 'PASS' for state in acceptance_states),
    'lifecycle_states': sorted(lifecycle_states),
}, sort_keys=True))
