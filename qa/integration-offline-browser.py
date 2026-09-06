from __future__ import annotations

import json
import os
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

WEB_BASE_URL = os.environ.get("QA_WEB_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
OPERATOR_LOGIN = os.environ.get("QA_OPERATOR_LOGIN", "qa.operator@example.invalid")
OPERATOR_PASSWORD = os.environ.get("QA_OPERATOR_PASSWORD")
if not OPERATOR_PASSWORD:
    raise RuntimeError("QA_OPERATOR_PASSWORD is required")

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1280,900")

browser_bin = os.environ.get("BROWSER_BIN")
if browser_bin:
    options.binary_location = browser_bin

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)
driver.execute_cdp_cmd("Network.enable", {})

results = {
    "schema_version": "0.5.0",
    "review_type": "integration_qa_offline",
    "reviewed_commit": os.environ.get("GITHUB_SHA"),
    "transport_simulation": "Chrome DevTools Network.setBlockedURLs on the SPA /api transport",
    "slices": {},
}


def visit(path: str) -> None:
    driver.get(f"{WEB_BASE_URL}{path}")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")


def set_input(element_id: str, value: str) -> None:
    element = wait.until(EC.visibility_of_element_located((By.ID, element_id)))
    element.clear()
    element.send_keys(value)


def click_button(label: str) -> None:
    button = wait.until(
        EC.element_to_be_clickable((By.XPATH, f"//button[normalize-space()={json.dumps(label, ensure_ascii=False)}]"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
    driver.execute_script("arguments[0].click();", button)


def wait_text(text: str) -> None:
    try:
        wait.until(lambda d: text.casefold() in d.find_element(By.TAG_NAME, "body").text.casefold())
    except Exception:
        body = driver.find_element(By.TAG_NAME, "body").text
        print(json.dumps({"event": "OFFLINE_ASSERTION_DIAGNOSTIC", "expected": text, "url": driver.current_url, "body": body}, ensure_ascii=False))
        raise


def block_api(value: bool) -> None:
    # The browser talks to the relative /api path through Vite's 5173 proxy. Blocking
    # that transport keeps the already-loaded SPA alive while making the authoritative
    # API unreachable, which is the client state this check is intended to prove.
    urls = [
        "*://127.0.0.1:5173/api/*",
        "*://localhost:5173/api/*",
    ] if value else []
    driver.execute_cdp_cmd("Network.setBlockedURLs", {"urls": urls})


try:
    # Digital claim intake: the loaded UI must fail closed when API transport disappears.
    visit("/claims/new/verify")
    set_input("policyReference", "SYN-POL-001")
    set_input("vehicleReference", "SYN-VEH-001")
    block_api(True)
    click_button("Verificar y continuar")
    wait_text("No pudimos conectar con el servicio")
    wait_text("No asumimos que la operación se completó")
    results["slices"]["digital-claim-intake/web"] = {
        "qa.offline": "PASS",
        "observation": "Verification fails closed and never substitutes authoritative API data while the SPA API transport is unavailable.",
    }
    block_api(False)

    # Customer tracking: proof lookup must expose the approved network/degraded presentation.
    visit("/claims/track")
    set_input("trackingCode", "SYN-OFFLINE-CODE")
    set_input("trackingPolicyReference", "SYN-POL-001")
    block_api(True)
    click_button("Consultar estado")
    wait_text("No pudimos conectar con el servicio")
    wait_text("No asumimos que la operación se completó")
    results["slices"]["customer-claim-tracking/web"] = {
        "qa.offline": "PASS",
        "observation": "Tracking lookup exposes the network state without fabricating a claim projection.",
    }
    block_api(False)

    # Backoffice: authenticate online, then prove an explicit refresh fails closed when
    # the API transport disappears while the protected SPA remains loaded.
    visit("/operator/login")
    set_input("operator-login", OPERATOR_LOGIN)
    set_input("operator-password", OPERATOR_PASSWORD)
    click_button("Ingresar")
    wait.until(lambda d: d.current_url.startswith(f"{WEB_BASE_URL}/operator/claims"))
    wait_text("Listado autoritativo del API")
    block_api(True)
    click_button("Actualizar")
    wait_text("Sin conexión con el servicio")
    wait_text("No mostramos datos locales como si fueran el estado real")
    results["slices"]["claims-backoffice/web"] = {
        "qa.offline": "PASS",
        "observation": "Protected claims refresh fails closed and explicitly refuses to present cached data as authoritative.",
    }
    block_api(False)
finally:
    try:
        block_api(False)
    except Exception:
        pass
    driver.quit()

Path(".runtime").mkdir(exist_ok=True)
out = Path(".runtime/integration-offline-browser.json")
out.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps({"event": "INTEGRATION_OFFLINE_BROWSER_PASS", "slices": sorted(results["slices"])}, ensure_ascii=False))
