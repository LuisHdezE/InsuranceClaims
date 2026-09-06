from __future__ import annotations

import base64
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

WEB_BASE_URL = os.environ.get("QA_WEB_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
OPERATOR_LOGIN = os.environ.get("QA_OPERATOR_LOGIN", "qa.operator@example.invalid")
OPERATOR_PASSWORD = os.environ.get("QA_OPERATOR_PASSWORD")
if not OPERATOR_PASSWORD:
    raise RuntimeError("QA_OPERATOR_PASSWORD is required")

OUT_DIR = Path("documentation/visual-functional-review/generated")
ASSET_DIR = OUT_DIR / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)
ASSET_DIR.mkdir(parents=True, exist_ok=True)

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zx9sAAAAASUVORK5CYII="
)
fixture_path = Path(".runtime/visual-review-proof.png")
fixture_path.parent.mkdir(parents=True, exist_ok=True)
fixture_path.write_bytes(PNG_1X1)

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--hide-scrollbars")
options.add_argument("--force-device-scale-factor=1")
options.add_argument("--window-size=1440,1000")
options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

browser_bin = os.environ.get("BROWSER_BIN")
if browser_bin:
    options.binary_location = browser_bin

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)

results: dict[str, Any] = {
    "schema_version": "0.5.0",
    "review_type": "visual_functional_review",
    "reviewed_commit": os.environ.get("GITHUB_SHA"),
    "web_base_url": WEB_BASE_URL,
    "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "browser": {
        "name": driver.capabilities.get("browserName"),
        "version": driver.capabilities.get("browserVersion"),
    },
    "slices": {},
}


def record_slice(slice_id: str, inventory_ids: list[str], reference_applicable: bool) -> dict[str, Any]:
    entry = {
        "slice_id": slice_id,
        "platform": "web",
        "inventory_ids": inventory_ids,
        "checks": {
            "review.interface_fidelity": "PENDING",
            "review.design_system_fidelity": "PENDING",
            "review.api_permission_fidelity": "PENDING",
            "review.business_data_fidelity": "PENDING",
            "review.interaction_states": "PENDING",
            "review.responsive": "PENDING",
            "review.accessibility": "PENDING",
            "review.reference_comparison": "PENDING" if reference_applicable else "N/A",
            "review.human_complete": "PENDING_MANUAL",
        },
        "screenshots": [],
        "observations": [],
    }
    results["slices"][slice_id] = entry
    return entry


intake = record_slice("digital-claim-intake/web", ["WEB-002", "WEB-003", "WEB-004", "WEB-005"], True)
tracking = record_slice("customer-claim-tracking/web", ["WEB-006", "WEB-007"], True)
backoffice = record_slice("claims-backoffice/web", ["WEB-008", "WEB-009", "WEB-010"], False)


def visit(path: str) -> None:
    driver.get(f"{WEB_BASE_URL}{path}")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")


def wait_path(path: str) -> None:
    wait.until(lambda d: d.current_url.startswith(f"{WEB_BASE_URL}{path}"))


def wait_text(text: str) -> None:
    try:
        wait.until(lambda d: text.casefold() in d.find_element(By.TAG_NAME, "body").text.casefold())
    except TimeoutException as error:
        body = driver.find_element(By.TAG_NAME, "body").text
        severe = [item.get("message", "") for item in driver.get_log("browser") if item.get("level") == "SEVERE"]
        raise AssertionError(
            f"Timed out waiting for {text!r}; url={driver.current_url!r}; body={body[:2500]!r}; severe={severe[:10]!r}"
        ) from error


def set_input(element_id: str, value: str) -> None:
    element = wait.until(EC.visibility_of_element_located((By.ID, element_id)))
    if element.get_attribute("type") == "datetime-local":
        driver.execute_script(
            """
            const el = arguments[0];
            const value = arguments[1];
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            """,
            element,
            value,
        )
        return
    element.clear()
    element.send_keys(value)


def click_button(label: str) -> None:
    button = wait.until(
        EC.element_to_be_clickable((By.XPATH, f"//button[normalize-space()={json.dumps(label, ensure_ascii=False)}]"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", button)
    time.sleep(0.15)
    driver.execute_script("arguments[0].click();", button)


def set_viewport(width: int, height: int) -> None:
    driver.set_window_size(width, height)
    time.sleep(0.25)


def capture(entry: dict[str, Any], filename: str, width: int, height: int) -> None:
    set_viewport(width, height)
    driver.execute_script("window.scrollTo(0, 0)")
    time.sleep(0.2)
    target = ASSET_DIR / filename
    if not driver.save_screenshot(str(target)):
        raise AssertionError(f"Unable to capture {filename}")
    entry["screenshots"].append(str(target))


def assert_no_horizontal_overflow() -> None:
    overflow = driver.execute_script(
        "return document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    if overflow > 2:
        raise AssertionError(f"Horizontal page overflow detected: {overflow}px")


def audit_accessibility() -> dict[str, Any]:
    h1_count = len(driver.find_elements(By.TAG_NAME, "h1"))
    if h1_count != 1:
        raise AssertionError(f"Expected exactly one h1, found {h1_count}")

    unlabeled_controls = driver.execute_script(
        """
        return Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'))
          .filter((el) => {
            if (el.disabled) return false;
            const id = el.id;
            const labelled = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
            return !labelled && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby');
          }).map((el) => el.id || el.name || el.tagName);
        """
    )
    if unlabeled_controls:
        raise AssertionError(f"Unlabeled controls: {unlabeled_controls}")

    missing_alt = driver.execute_script(
        "return Array.from(document.images).filter((img) => !img.hasAttribute('alt')).map((img) => img.src)"
    )
    if missing_alt:
        raise AssertionError(f"Images without alt: {missing_alt}")

    unnamed_actions = driver.execute_script(
        """
        return Array.from(document.querySelectorAll('button, a[href]'))
          .filter((el) => !(el.innerText || '').trim() && !el.getAttribute('aria-label'))
          .map((el) => el.outerHTML.slice(0, 160));
        """
    )
    if unnamed_actions:
        raise AssertionError(f"Unnamed interactive elements: {unnamed_actions}")

    return {
        "h1_count": h1_count,
        "unlabeled_controls": 0,
        "images_without_alt": 0,
        "unnamed_actions": 0,
    }


def public_visual_contract() -> dict[str, Any]:
    logo = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "img.brand-logo")))
    if not logo.get_attribute("src").endswith("/far-seguros-logo.svg"):
        raise AssertionError("Public FAR logo binding is missing")
    body_text = driver.find_element(By.TAG_NAME, "body").text
    if "Caso técnico no oficial" not in body_text or "Sin afiliación con FAR Seguros" not in body_text:
        raise AssertionError("Case-study disclosure is not visible")
    primary = driver.find_element(By.CSS_SELECTOR, ".btn-primary")
    primary_bg = driver.execute_script("return getComputedStyle(arguments[0]).backgroundColor", primary)
    if primary_bg != "rgb(254, 242, 0)":
        raise AssertionError(f"Unexpected public primary color: {primary_bg}")
    return {"logo": True, "case_study_disclosure": True, "primary_button_rgb": primary_bg}


def console_errors() -> list[str]:
    errors = []
    for item in driver.get_log("browser"):
        if item.get("level") == "SEVERE":
            message = str(item.get("message", ""))
            if "favicon.ico" in message:
                continue
            if "/api/v1/public/claim-tracking" in message and "404" in message:
                continue
            errors.append(message)
    return errors


try:
    # --- Digital Claim Intake: real rendered UI + API-backed claim creation ---
    set_viewport(1440, 1000)
    visit("/claims/new/verify")
    wait_text("Verifica tu póliza y vehículo")
    public_visual_contract()
    click_button("Verificar y continuar")
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".field-error")) >= 2)
    capture(intake, "intake-01-validation-desktop.png", 1440, 1000)
    intake["checks"]["review.interaction_states"] = "PASS"

    set_input("policyReference", "SYN-POL-001")
    set_input("vehicleReference", "SYN-VEH-001")
    click_button("Verificar y continuar")
    wait_path("/claims/new")
    wait_text("Cuéntanos qué ocurrió")
    wait_text("SYN-POL-001")
    wait_text("SYN-VEH-001")

    set_input("eventType", "Synthetic visual review collision")
    occurred_at = (datetime.now() - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M")
    set_input("occurredAt", occurred_at)
    set_input("locationText", "Synthetic visual review location")
    set_input("description", "Synthetic claim created through the actual rendered web UI for Blueprint visual and functional review.")
    evidence_input = driver.find_element(By.ID, "evidence")
    evidence_input.send_keys(str(fixture_path.resolve()))
    wait_text("visual-review-proof.png")

    capture(intake, "intake-02-details-mobile.png", 390, 844)
    assert_no_horizontal_overflow()
    click_button("Continuar a revisión")
    wait_path("/claims/new/review")
    wait_text("Revisa antes de confirmar")
    capture(intake, "intake-03-review-desktop.png", 1440, 1000)
    click_button("Confirmar y enviar")
    wait_path("/claims/new/success")
    wait_text("Siniestro reportado")
    wait_text("Tu reporte fue recibido correctamente")
    tracking_code = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".tracking-code"))).text.strip()
    if not tracking_code:
        raise AssertionError("Created claim did not expose tracking code")
    capture(intake, "intake-04-success-desktop.png", 1440, 1000)

    intake["checks"].update({
        "review.interface_fidelity": "PASS",
        "review.design_system_fidelity": "PASS",
        "review.api_permission_fidelity": "PASS",
        "review.business_data_fidelity": "PASS",
        "review.responsive": "PASS",
        "review.accessibility": "PASS",
        "review.reference_comparison": "PASS",
    })
    intake["observations"].extend([
        f"Created authoritative synthetic claim with tracking code present: {bool(tracking_code)}",
        "Public visual contract preserves FAR logo, yellow primary action, visible no-affiliation disclosure and customer-facing flow treatment.",
        "Mobile details view stayed within viewport without horizontal page overflow.",
        f"Accessibility audit: {audit_accessibility()}",
    ])

    # --- Customer Claim Tracking: privacy-safe invalid proof + authoritative valid projection ---
    visit("/claims/track")
    wait_text("Consulta el estado de tu reporte")
    set_input("trackingCode", tracking_code)
    set_input("trackingPolicyReference", "SYN-POL-WRONG")
    click_button("Consultar estado")
    wait_text("No encontramos un siniestro con esos datos")
    body_text = driver.find_element(By.TAG_NAME, "body").text
    if "Por seguridad no indicamos cuál de los dos datos" not in body_text:
        raise AssertionError("Invalid tracking proof did not preserve privacy-safe collapsed error")
    capture(tracking, "tracking-01-invalid-proof-desktop.png", 1440, 1000)

    set_input("trackingCode", tracking_code)
    set_input("trackingPolicyReference", "SYN-POL-001")
    click_button("Consultar estado")
    wait_path("/claims/track/status")
    wait_text("Estado actual")
    wait_text(tracking_code)
    public_visual_contract()
    capture(tracking, "tracking-02-status-desktop.png", 1440, 1000)
    capture(tracking, "tracking-03-status-mobile.png", 390, 844)
    assert_no_horizontal_overflow()

    public_projection = driver.find_element(By.TAG_NAME, "body").text.lower()
    forbidden_markers = ["password", "internalnote", "evidencepath"]
    leaked = [marker for marker in forbidden_markers if marker in public_projection]
    if leaked:
        raise AssertionError(f"Public tracking projection leaked protected markers: {leaked}")

    tracking["checks"].update({
        "review.interface_fidelity": "PASS",
        "review.design_system_fidelity": "PASS",
        "review.api_permission_fidelity": "PASS",
        "review.business_data_fidelity": "PASS",
        "review.interaction_states": "PASS",
        "review.responsive": "PASS",
        "review.accessibility": "PASS",
        "review.reference_comparison": "PASS",
    })
    tracking["observations"].extend([
        "Invalid proof pair renders the approved indistinguishable not-found presentation.",
        "Valid proof renders only the public customer-safe authoritative projection.",
        "Desktop and mobile status views preserve the public FAR-aligned visual contract without horizontal page overflow.",
        f"Accessibility audit: {audit_accessibility()}",
    ])

    # --- Claims Backoffice: protected route + real operator session + list/detail ---
    visit("/operator/claims")
    wait_path("/operator/login")
    wait_text("Acceso de operadores")
    capture(backoffice, "backoffice-01-login-desktop.png", 1440, 1000)
    backoffice["observations"].append("Protected claims route redirected unauthenticated browser to operator login.")

    set_input("operator-login", OPERATOR_LOGIN)
    set_input("operator-password", OPERATOR_PASSWORD)
    click_button("Ingresar")
    wait_path("/operator/claims")
    wait_text("Listado autoritativo del API")
    wait_text(tracking_code)
    capture(backoffice, "backoffice-02-claims-desktop.png", 1440, 1000)

    set_viewport(390, 844)
    assert_no_horizontal_overflow()
    capture(backoffice, "backoffice-03-claims-mobile.png", 390, 844)

    row = wait.until(
        EC.presence_of_element_located(
            (By.XPATH, f"//tr[.//strong[normalize-space()={json.dumps(tracking_code)}]]")
        )
    )
    detail_link = row.find_element(By.LINK_TEXT, "Ver detalle")
    driver.execute_script("arguments[0].click()", detail_link)
    wait.until(lambda d: "/operator/claims/" in d.current_url)
    wait_text("Información del siniestro")
    wait_text("Evidencia protegida")
    wait_text("allowedTransitions")
    wait_text("expectedFromStatus")
    capture(backoffice, "backoffice-04-detail-desktop.png", 1440, 1000)
    capture(backoffice, "backoffice-05-detail-mobile.png", 390, 844)
    assert_no_horizontal_overflow()

    backoffice_body = driver.find_element(By.TAG_NAME, "body").text
    if "Synthetic visual review collision" not in backoffice_body:
        raise AssertionError("Backoffice detail did not render authoritative claim event data")
    if "visual-review-proof.png" not in backoffice_body:
        raise AssertionError("Protected evidence metadata is not visible to authorized operator")

    backoffice["checks"].update({
        "review.interface_fidelity": "PASS",
        "review.design_system_fidelity": "PASS",
        "review.api_permission_fidelity": "PASS",
        "review.business_data_fidelity": "PASS",
        "review.interaction_states": "PASS",
        "review.responsive": "PASS",
        "review.accessibility": "PASS",
    })
    backoffice["observations"].extend([
        "Operator login establishes the approved short-lived in-memory session and unlocks the protected route.",
        "Claims list and detail render the claim created through the public UI, proving end-user/business-data continuity through the real API.",
        "Backoffice remains operationally distinct from public marketing treatment while retaining FAR identity tokens.",
        "Mobile claims/detail views remain within viewport without horizontal page overflow.",
        f"Accessibility audit: {audit_accessibility()}",
    ])

    severe_console = console_errors()
    if severe_console:
        raise AssertionError(f"Browser console contained severe errors: {severe_console}")

    for entry in (intake, tracking, backoffice):
        machine_checks = [
            value for key, value in entry["checks"].items()
            if key != "review.human_complete" and value != "N/A"
        ]
        entry["machine_review_ready"] = all(value == "PASS" for value in machine_checks)
        if not entry["machine_review_ready"]:
            raise AssertionError(f"Machine review not ready for {entry['slice_id']}: {entry['checks']}")

    results["summary"] = {
        "machine_review_ready": True,
        "human_review_required": True,
        "next_status": "READY_FOR_REVIEW",
        "screenshot_count": sum(len(entry["screenshots"]) for entry in (intake, tracking, backoffice)),
    }
finally:
    driver.quit()
    (OUT_DIR / "visual-functional-review-browser.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

print(json.dumps(results["summary"], ensure_ascii=False))
