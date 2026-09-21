from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE = os.environ.get("QA_WEB_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
DEAD_LETTER_ID = "77777777-7777-4777-8777-777777777777"
EVENT_ID = "88888888-8888-4888-8888-888888888888"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
ARTIFACT_DIR = Path(".qa-artifacts/recovery-r3")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

options = webdriver.ChromeOptions()
for arg in ("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--force-device-scale-factor=1"):
    options.add_argument(arg)
options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
if os.environ.get("BROWSER_BIN"):
    options.binary_location = os.environ["BROWSER_BIN"]

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)
results: list[dict[str, object]] = []


def viewport(width: int, height: int) -> None:
    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
        "width": width, "height": height, "deviceScaleFactor": 1, "mobile": False,
    })
    time.sleep(0.2)
    driver.execute_script("window.scrollTo(0,0)")


def capture(name: str) -> tuple[str, str]:
    shot = ARTIFACT_DIR / f"{name}.png"
    driver.save_screenshot(str(shot))
    full = ARTIFACT_DIR / f"{name}-full.png"
    payload = driver.execute_cdp_cmd("Page.captureScreenshot", {
        "format": "png", "captureBeyondViewport": True, "fromSurface": True,
    })
    full.write_bytes(base64.b64decode(payload["data"]))
    return str(shot), str(full)


def tracks(value: str) -> int:
    return len([part for part in value.split(" ") if part.strip()])


def containment(width: int, selector: str = ".recovery-admin-main") -> dict[str, object]:
    metrics = driver.execute_script("""
      const page=document.querySelector(arguments[0]);
      const root=document.documentElement, body=document.body;
      const title=page?.querySelector('h1');
      const grid=page?.querySelector('.recovery-admin-grid');
      const facts=page?.querySelector('.recovery-facts.is-detail');
      return {
        innerWidth:window.innerWidth,
        scrollWidth:Math.max(root.scrollWidth,body.scrollWidth),
        titleFont:title?parseFloat(getComputedStyle(title).fontSize):0,
        grid:grid?getComputedStyle(grid).gridTemplateColumns:'',
        facts:facts?getComputedStyle(facts).gridTemplateColumns:''
      };
    """, selector)
    overflow = metrics["scrollWidth"] - metrics["innerWidth"]
    if overflow > 2:
        raise AssertionError(f"global overflow at {width}px: {overflow}px")
    if width <= 680 and metrics["titleFont"] > 28:
        raise AssertionError(f"mobile title oversized: {metrics['titleFont']}px")
    return {**metrics, "horizontalOverflow": overflow}


def spa(path: str) -> None:
    driver.execute_script(
        "window.history.pushState({},'',arguments[0]);window.dispatchEvent(new PopStateEvent('popstate'));",
        path,
    )


def open_confirmation(label: str, title: str, width: int, height: int) -> dict[str, object]:
    trigger = wait.until(EC.element_to_be_clickable((By.XPATH, f"//button[normalize-space(.)='{label}']")))
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", trigger)
    trigger.click()
    dialog = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "[role='alertdialog'].recovery-confirmation")))
    if title not in dialog.text or "expectedVersion 3" not in dialog.text:
        raise AssertionError("Recovery confirmation lost governed title/version disclosure")
    if "no repetirá la mutación automáticamente" not in dialog.text:
        raise AssertionError("Recovery confirmation lost no-blind-retry disclosure")
    confirm = dialog.find_element(By.CSS_SELECTOR, ".recovery-confirmation-button.is-confirm")
    cancel = dialog.find_element(By.CSS_SELECTOR, ".recovery-confirmation-button.is-cancel")
    data = driver.execute_script("""
      const d=arguments[0],c=arguments[1],x=arguments[2];
      return {dialogWidth:Math.round(d.getBoundingClientRect().width),confirmHeight:Math.round(c.getBoundingClientRect().height),cancelHeight:Math.round(x.getBoundingClientRect().height),activeIsConfirm:document.activeElement===c};
    """, dialog, confirm, cancel)
    if data["confirmHeight"] < 44 or data["cancelHeight"] < 44 or not data["activeIsConfirm"]:
        raise AssertionError(f"Recovery confirmation accessibility target/focus failed at {width}x{height}: {data}")
    return data


try:
    viewport(1366, 768)
    driver.get(f"{BASE}/operator/login")
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "#operator-login"))).send_keys("demo.admin@eliasworks.invalid")
    driver.find_element(By.CSS_SELECTOR, "#operator-password").send_keys("visual-qa-password")
    driver.find_element(By.XPATH, "//button[normalize-space(.)='Ingresar al workspace']").click()
    wait.until(lambda d: d.current_url.endswith("/operator/workspace"))

    spa("/operator/admin/recovery")
    wait.until(lambda d: d.current_url.endswith("/operator/admin/recovery"))
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".recovery-table tbody tr")) == 3)
    text = driver.find_element(By.CSS_SELECTOR, ".recovery-admin-main").text
    for expected in ("Integraciones y recuperación", "Diagnóstico de evento de integración", "Frontera de recuperación", "Cola de dead letters"):
        if expected not in text:
            raise AssertionError(f"Recovery directory missing: {expected}")
    if driver.find_elements(By.CSS_SELECTOR, ".recovery-dead-letter-panel input[type='search'], .recovery-dead-letter-panel select"):
        raise AssertionError("Recovery dead-letter directory invented search/filter controls")

    event_input = driver.find_element(By.CSS_SELECTOR, ".recovery-event-form input")
    event_input.send_keys(EVENT_ID)
    driver.find_element(By.XPATH, "//button[normalize-space(.)='Consultar evento']").click()
    wait.until(EC.text_to_be_present_in_element((By.CSS_SELECTOR, ".recovery-event-result"), "SYNTHETIC_POLICY_UPDATED"))
    driver.get_log("browser")

    for width, height in TARGETS:
        viewport(width, height)
        metric = containment(width)
        columns = tracks(str(metric["grid"]))
        expected = 2 if width > 980 else 1
        if columns != expected:
            raise AssertionError(f"Recovery grid expected {expected} columns at {width}px, got {metric['grid']}")
        shot, full = capture(f"recovery-directory-{width}x{height}")
        results.append({"surface": "directory", "width": width, "height": height, **metric, "gridColumns": columns, "screenshot": shot, "fullPageScreenshot": full})

    viewport(1366, 768)
    wait.until(EC.element_to_be_clickable((By.XPATH, "//a[contains(normalize-space(.),'Inspeccionar')]"))).click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/recovery/dead-letters/{DEAD_LETTER_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".recovery-actions")))

    for width, height in TARGETS:
        viewport(width, height)
        metric = containment(width)
        columns = tracks(str(metric["facts"]))
        expected = 4 if width > 980 else 2 if width > 680 else 1
        if columns != expected:
            raise AssertionError(f"Recovery detail expected {expected} fact columns at {width}px, got {metric['facts']}")
        shot, full = capture(f"recovery-detail-{width}x{height}")
        results.append({"surface": "detail", "width": width, "height": height, **metric, "factColumns": columns, "screenshot": shot, "fullPageScreenshot": full})

    for width, height in ((1366, 768), (390, 844)):
        viewport(width, height)
        confirmation = open_confirmation("Reencolar para nuevo intento", "Confirmar reencolado", width, height)
        metric = containment(width)
        shot, full = capture(f"recovery-confirm-requeue-{width}x{height}")
        results.append({"surface": "confirmation-requeue", "width": width, "height": height, **metric, **confirmation, "screenshot": shot, "fullPageScreenshot": full})
        driver.switch_to.active_element.send_keys(Keys.ESCAPE)
        wait.until(lambda d: not d.find_elements(By.CSS_SELECTOR, "[role='alertdialog'].recovery-confirmation"))

    viewport(1366, 768)
    confirmation = open_confirmation("Resolver administrativamente", "Confirmar resolución administrativa", 1366, 768)
    dialog_text = driver.find_element(By.CSS_SELECTOR, "[role='alertdialog'].recovery-confirmation").text
    if "no será reencolado" not in dialog_text:
        raise AssertionError("Resolve confirmation lost no-requeue disclosure")
    metric = containment(1366)
    shot, full = capture("recovery-confirm-resolve-1366x768")
    results.append({"surface": "confirmation-resolve", "width": 1366, "height": 768, **metric, **confirmation, "screenshot": shot, "fullPageScreenshot": full})

    errors = [entry.get("message", "") for entry in driver.get_log("browser") if entry.get("level") == "SEVERE" and "favicon.ico" not in entry.get("message", "")]
    if errors:
        raise AssertionError(f"Severe browser console entries: {errors}")

    (ARTIFACT_DIR / "viewport-metrics.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"status": "PASS", "captures": len(results)}, ensure_ascii=False))
finally:
    driver.quit()
