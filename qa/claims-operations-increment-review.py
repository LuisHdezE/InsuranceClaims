from __future__ import annotations

import base64
import json
import os
import time
from datetime import datetime, timedelta, timezone
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

OUT_DIR = Path("documentation/claims-operations/review/generated")
ASSET_DIR = OUT_DIR / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)
ASSET_DIR.mkdir(parents=True, exist_ok=True)

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zx9sAAAAASUVORK5CYII="
)
fixture_path = Path(".runtime/claims-operations-review-proof.png")
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
    "schema_version": "1.0.0",
    "review_type": "claims_operations_experience_increment",
    "candidate_version": "0.2.0",
    "baseline_version": "0.1.0",
    "reviewed_commit": os.environ.get("GITHUB_SHA"),
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "browser": {
        "name": driver.capabilities.get("browserName"),
        "version": driver.capabilities.get("browserVersion"),
    },
    "journey": {},
    "surfaces": {},
}


def surface(surface_id: str, route: str, inventory: list[str]) -> dict[str, Any]:
    entry = {
        "surface_id": surface_id,
        "route": route,
        "inventory_targets": inventory,
        "checks": {},
        "screenshots": [],
        "observations": [],
    }
    results["surfaces"][surface_id] = entry
    return entry


home = surface("public-home-continuity", "/", ["public landing"])
dashboard = surface("operations-dashboard", "/operator/dashboard", ["WEB-011"])
claims = surface("claims-workspace", "/operator/claims", ["WEB-009 evolution"])
detail = surface("claim-operations-detail", "/operator/claims/:claimId", ["WEB-010 evolution"])
tasks = surface("tasks-workspace", "/operator/tasks", ["WEB-012"])
tracking = surface("public-tracking-continuity", "/claims/track", ["WEB-006", "WEB-007"])


def visit(path: str) -> None:
    """Full navigation. Use only before operator authentication or after leaving operator scope."""
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
            f"Timed out waiting for {text!r}; url={driver.current_url!r}; body={body[:3000]!r}; severe={severe[:10]!r}"
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


def click_nav(label: str, path: str) -> None:
    """Navigate through React Router without reloading the in-memory operator session."""
    link = wait.until(
        EC.element_to_be_clickable(
            (By.XPATH, f"//a[contains(@class,'ops-nav-link')][.//span[normalize-space()={json.dumps(label, ensure_ascii=False)}]]")
        )
    )
    driver.execute_script("arguments[0].click();", link)
    wait_path(path)


def click_element(element) -> None:
    driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", element)
    time.sleep(0.1)
    driver.execute_script("arguments[0].click();", element)


def set_viewport(width: int, height: int) -> None:
    driver.set_window_size(width, height)
    time.sleep(0.3)


def capture(entry: dict[str, Any], filename: str, width: int, height: int) -> None:
    set_viewport(width, height)
    driver.execute_script("window.scrollTo(0, 0)")
    time.sleep(0.25)
    target = ASSET_DIR / filename
    if not driver.save_screenshot(str(target)):
        raise AssertionError(f"Unable to capture {filename}")
    entry["screenshots"].append(str(target))


def assert_no_horizontal_overflow() -> dict[str, int]:
    metrics = driver.execute_script(
        """
        const root = document.documentElement;
        return {
          viewport: root.clientWidth,
          scrollWidth: root.scrollWidth,
          overflow: root.scrollWidth - root.clientWidth,
        };
        """
    )
    if metrics["overflow"] > 2:
        raise AssertionError(
            f"Horizontal page overflow detected: {metrics['overflow']}px; "
            f"viewport={metrics['viewport']}px; scrollWidth={metrics['scrollWidth']}px"
        )
    return metrics


def audit_accessibility() -> dict[str, int]:
    h1_count = len(driver.find_elements(By.TAG_NAME, "h1"))
    if h1_count != 1:
        raise AssertionError(f"Expected exactly one h1, found {h1_count} at {driver.current_url}")

    unlabeled_controls = driver.execute_script(
        """
        return Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'))
          .filter((el) => {
            if (el.disabled) return false;
            const id = el.id;
            const labelled = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
            const wrapped = el.closest('label');
            return !labelled && !wrapped && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby');
          }).map((el) => el.id || el.name || el.tagName);
        """
    )
    if unlabeled_controls:
        raise AssertionError(f"Unlabeled controls at {driver.current_url}: {unlabeled_controls}")

    missing_alt = driver.execute_script(
        "return Array.from(document.images).filter((img) => !img.hasAttribute('alt')).map((img) => img.src)"
    )
    if missing_alt:
        raise AssertionError(f"Images without alt at {driver.current_url}: {missing_alt}")

    return {"h1_count": h1_count, "unlabeled_controls": 0, "images_without_alt": 0}


def operator_contract() -> None:
    body = driver.find_element(By.TAG_NAME, "body").text
    for marker in [
        "FAR demo",
        "Personas. Procesos. Confianza.",
        "Caso técnico no oficial · No oficial · Sin afiliación",
        "Datos exclusivamente sintéticos.",
        "Dashboard",
        "Claims",
        "Tasks",
    ]:
        if marker not in body:
            raise AssertionError(f"Operator visual/disclosure marker missing: {marker}")


def console_errors() -> list[str]:
    errors: list[str] = []
    for item in driver.get_log("browser"):
        if item.get("level") != "SEVERE":
            continue
        message = str(item.get("message", ""))
        if "favicon.ico" in message:
            continue
        errors.append(message)
    return errors


def find_claim_detail_link(tracking_code: str):
    cards = driver.find_elements(
        By.XPATH,
        "//a[contains(concat(' ', normalize-space(@class), ' '), ' ops-claim-card ')]"
        f"[.//strong[normalize-space()={json.dumps(tracking_code, ensure_ascii=False)}]]",
    )
    if cards:
        return cards[0]
    rows = driver.find_elements(
        By.XPATH,
        f"//tr[.//strong[normalize-space()={json.dumps(tracking_code, ensure_ascii=False)}]]",
    )
    if rows:
        return rows[0].find_element(By.LINK_TEXT, "Ver detalle")
    return False


def kpi_value(label: str) -> int:
    card = wait.until(
        EC.visibility_of_element_located(
            (By.XPATH, f"//article[contains(@class,'ops-kpi-card')][.//span[normalize-space()={json.dumps(label, ensure_ascii=False)}]]")
        )
    )
    value = card.find_element(By.TAG_NAME, "strong").text.strip()
    return int(value)


def open_claim_detail(tracking_code: str) -> None:
    wait_text(tracking_code)
    detail_link = wait.until(lambda d: find_claim_detail_link(tracking_code))
    click_element(detail_link)
    wait.until(lambda d: "/operator/claims/" in d.current_url and not d.current_url.endswith("/operator/claims"))


try:
    # 1. Public landing continuity and embedded hero asset.
    visit("/")
    wait_text("Protección simple")
    hero = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "img.landing-hero-photo")))
    hero_state = driver.execute_script(
        "return {src: arguments[0].src, naturalWidth: arguments[0].naturalWidth, naturalHeight: arguments[0].naturalHeight}",
        hero,
    )
    if hero_state["naturalWidth"] <= 0 or hero_state["naturalHeight"] <= 0:
        raise AssertionError(f"Home hero did not render: {hero_state}")
    if not str(hero_state["src"]).startswith("data:image/avif;base64,"):
        raise AssertionError("Home hero is not bound to the repo-owned embedded AVIF asset")
    capture(home, "00-home-desktop.png", 1440, 1000)
    capture(home, "01-home-mobile.png", 390, 844)
    assert_no_horizontal_overflow()
    home["checks"] = {"hero_rendered": "PASS", "responsive": "PASS", "accessibility": "PASS"}
    home["observations"].append(f"Embedded hero rendered at {hero_state['naturalWidth']}×{hero_state['naturalHeight']}.")
    home["observations"].append(f"Accessibility: {audit_accessibility()}")

    # 2. Create one authoritative synthetic Claim through the rendered public UI.
    set_viewport(1440, 1000)
    visit("/claims/new/verify")
    wait_text("Verifica tu póliza y vehículo")
    set_input("policyReference", "SYN-POL-001")
    set_input("vehicleReference", "SYN-VEH-001")
    click_button("Verificar y continuar")
    wait_path("/claims/new")
    wait_text("Cuéntanos qué ocurrió")

    set_input("eventType", "Synthetic Claims Operations increment review")
    occurred_at = (datetime.now() - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M")
    set_input("occurredAt", occurred_at)
    set_input("locationText", "Synthetic Claims Operations review location")
    set_input(
        "description",
        "Synthetic claim created through the rendered public UI to review the post-MVP Claims Operations increment.",
    )
    driver.find_element(By.ID, "evidence").send_keys(str(fixture_path.resolve()))
    wait_text("claims-operations-review-proof.png")
    click_button("Continuar a revisión")
    wait_path("/claims/new/review")
    wait_text("Revisa antes de confirmar")
    click_button("Confirmar y enviar")
    wait_path("/claims/new/success")
    wait_text("Siniestro reportado")
    tracking_code = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".tracking-code"))).text.strip()
    if not tracking_code:
        raise AssertionError("Created Claim did not expose tracking code")
    results["journey"]["tracking_code_present"] = True

    # 3. Protected operator login. Full navigation is allowed until authentication exists.
    visit("/operator/claims")
    wait_path("/operator/login")
    wait_text("Acceso de operadores")
    set_input("operator-login", OPERATOR_LOGIN)
    set_input("operator-password", OPERATOR_PASSWORD)
    click_button("Ingresar")
    wait_path("/operator/claims")
    wait_text("Gestión de siniestros")

    # 4. Operations Dashboard before review completion. SPA navigation preserves in-memory session.
    click_nav("Dashboard", "/operator/dashboard")
    wait_text("Dashboard")
    wait_text(tracking_code)
    wait_text("Evidencia pendiente")
    operator_contract()
    evidence_pending_before = kpi_value("Evidencia pendiente")
    tasks_open_before = kpi_value("Tareas abiertas")
    if evidence_pending_before < 1:
        raise AssertionError("Expected at least one open EVIDENCE_REVIEW task before review completion")
    if tasks_open_before < 2:
        raise AssertionError("Expected Claim review + evidence review tasks before review completion")
    capture(dashboard, "02-dashboard-desktop.png", 1440, 1000)
    capture(dashboard, "03-dashboard-mobile.png", 390, 844)
    assert_no_horizontal_overflow()
    dashboard["checks"] = {"authoritative_data": "PASS", "responsive": "PASS", "accessibility": "PASS"}
    dashboard["observations"].append(
        f"Before evidence review: evidence_pending={evidence_pending_before}, open_tasks={tasks_open_before}."
    )
    dashboard["observations"].append(f"Accessibility: {audit_accessibility()}")

    # 5. Claims Kanban projection.
    click_nav("Claims", "/operator/claims")
    wait_text("Gestión de siniestros")
    wait_text("Reportados")
    wait_text("En gestión")
    wait_text("Requiere información")
    wait_text("Resueltos")
    wait_text(tracking_code)
    operator_contract()
    capture(claims, "04-claims-kanban-desktop.png", 1440, 1000)
    capture(claims, "05-claims-kanban-mobile.png", 390, 844)
    assert_no_horizontal_overflow()
    claims["checks"] = {"kanban_projection": "PASS", "responsive": "PASS", "accessibility": "PASS"}
    claims["observations"].append("Authoritative RECEIVED Claim appears in the Reportados projection.")
    claims["observations"].append(f"Accessibility: {audit_accessibility()}")

    open_claim_detail(tracking_code)

    # 6. Claim Operations Detail before review completion.
    wait_text(tracking_code)
    wait_text("Información del siniestro")
    wait_text("Trabajo y ciclo de vida están separados")
    wait_text("Revisión de evidencia")
    wait_text("Pendiente de revisión")
    wait_text("Timeline")
    wait_text("Tarea creada")
    operator_contract()
    status_before = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".ops-detail-status .status-badge"))).text.strip()
    if status_before != "RECEIVED":
        raise AssertionError(f"Expected initial Claim status RECEIVED, got {status_before}")
    capture(detail, "06-claim-detail-desktop.png", 1440, 1000)
    capture(detail, "07-claim-detail-mobile.png", 390, 844)
    assert_no_horizontal_overflow()
    detail["checks"] = {"tasks_evidence_timeline": "PASS", "responsive": "PASS", "accessibility": "PASS"}
    detail["observations"].append(f"Accessibility: {audit_accessibility()}")

    # 7. Complete only the evidence-review task. Claim lifecycle must remain unchanged.
    click_button("Completar revisión")
    wait_text("Revisión operativa completada")
    wait_text("Tarea completada")
    status_after_task = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".ops-detail-status .status-badge"))).text.strip()
    if status_after_task != "RECEIVED":
        raise AssertionError(f"Task completion changed Claim lifecycle unexpectedly: {status_after_task}")
    capture(detail, "08-claim-detail-reviewed-desktop.png", 1440, 1000)
    detail["checks"]["task_lifecycle_separation"] = "PASS"
    detail["observations"].append("EVIDENCE_REVIEW completed while authoritative Claim status remained RECEIVED.")

    # 8. Dashboard derives reduced evidence attention from real task state.
    click_nav("Dashboard", "/operator/dashboard")
    wait_text("Dashboard")
    evidence_pending_after = kpi_value("Evidencia pendiente")
    tasks_open_after = kpi_value("Tareas abiertas")
    if evidence_pending_after != evidence_pending_before - 1:
        raise AssertionError(
            f"Evidence pending KPI did not fall by one: before={evidence_pending_before}, after={evidence_pending_after}"
        )
    if tasks_open_after != tasks_open_before - 1:
        raise AssertionError(
            f"Open task KPI did not fall by one: before={tasks_open_before}, after={tasks_open_after}"
        )
    dashboard["checks"]["task_projection_refresh"] = "PASS"
    dashboard["observations"].append(
        f"After evidence review: evidence_pending={evidence_pending_after}, open_tasks={tasks_open_after}."
    )

    # 9. Tasks Workspace shows remaining real work for the same Claim.
    click_nav("Tasks", "/operator/tasks")
    wait_text("Tareas operativas")
    wait_text("Cola de trabajo")
    wait_text(tracking_code)
    operator_contract()
    capture(tasks, "09-tasks-desktop.png", 1440, 1000)
    capture(tasks, "10-tasks-mobile.png", 390, 844)
    assert_no_horizontal_overflow()
    tasks["checks"] = {"real_task_queue": "PASS", "responsive": "PASS", "accessibility": "PASS"}
    tasks["observations"].append("After evidence review completion, the remaining Claim review task stays OPEN.")
    tasks["observations"].append(f"Accessibility: {audit_accessibility()}")

    # 10. Return through SPA navigation. Only explicit Claim transition changes lifecycle state.
    click_nav("Claims", "/operator/claims")
    open_claim_detail(tracking_code)
    wait_text("Iniciar revisión")
    click_button("▷ Iniciar revisión")
    wait.until(
        lambda d: d.find_element(By.CSS_SELECTOR, ".ops-detail-status .status-badge").text.strip() == "UNDER_REVIEW"
    )
    wait_text("Cambio de estado")
    wait_text("Recibido → En revisión")
    results["journey"]["claim_status_after_explicit_transition"] = "UNDER_REVIEW"
    detail["checks"]["explicit_lifecycle_transition"] = "PASS"

    # 11. Public tracking can reload because operator session is no longer needed.
    visit("/claims/track")
    wait_text("Consulta el estado de tu reporte")
    set_input("trackingCode", tracking_code)
    set_input("trackingPolicyReference", "SYN-POL-001")
    click_button("Consultar estado")
    wait_path("/claims/track/status")
    wait_text("Estado actual")
    wait_text("En revisión")
    public_body = driver.find_element(By.TAG_NAME, "body").text.lower()
    forbidden_markers = [
        "evidence_review",
        "claim_review",
        "tarea completada",
        "actividad técnica / auditoría",
        "request id",
        "expectedfromstatus",
    ]
    leaked = [marker for marker in forbidden_markers if marker in public_body]
    if leaked:
        raise AssertionError(f"Public tracking leaked operator-only markers: {leaked}")
    capture(tracking, "11-public-tracking-after-transition.png", 1440, 1000)
    tracking["checks"] = {"customer_safe_projection": "PASS", "accessibility": "PASS"}
    tracking["observations"].append("Public tracking reflects UNDER_REVIEW without internal task/audit leakage.")
    tracking["observations"].append(f"Accessibility: {audit_accessibility()}")

    severe = console_errors()
    if severe:
        raise AssertionError(f"Browser console contained severe errors: {severe}")

    results["journey"].update({
        "evidence_pending_before": evidence_pending_before,
        "evidence_pending_after": evidence_pending_after,
        "tasks_open_before": tasks_open_before,
        "tasks_open_after": tasks_open_after,
        "claim_status_after_task_completion": status_after_task,
        "public_tracking_after_transition": "UNDER_REVIEW",
    })

    for entry in results["surfaces"].values():
        if not entry["checks"]:
            raise AssertionError(f"Surface has no checks: {entry['surface_id']}")
        if any(value != "PASS" for value in entry["checks"].values()):
            raise AssertionError(f"Surface review failed: {entry['surface_id']} {entry['checks']}")
        entry["machine_review_ready"] = True
        entry["human_review"] = "PENDING_MANUAL"

    screenshot_count = sum(len(entry["screenshots"]) for entry in results["surfaces"].values())
    if screenshot_count != 12:
        raise AssertionError(f"Expected 12 screenshots, got {screenshot_count}")

    results["summary"] = {
        "machine_review_ready": True,
        "human_review_required": True,
        "next_status": "READY_FOR_HUMAN_REVIEW",
        "candidate_version": "0.2.0",
        "screenshot_count": screenshot_count,
        "historical_mvp_evidence_preserved": True,
    }
finally:
    driver.quit()
    (OUT_DIR / "claims-operations-increment-review.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

print(json.dumps(results.get("summary", {"machine_review_ready": False}), ensure_ascii=False))
