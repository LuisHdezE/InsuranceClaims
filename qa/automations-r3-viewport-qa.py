from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

WEB_BASE_URL = os.environ.get("QA_WEB_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
DEFINITION_ID = "a5000000-0000-4000-8000-000000000001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/automations-r3")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--force-device-scale-factor=1")
options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

browser_bin = os.environ.get("BROWSER_BIN")
if browser_bin:
    options.binary_location = browser_bin

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)
results: list[dict[str, object]] = []


def set_viewport(width: int, height: int) -> None:
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False},
    )
    time.sleep(0.25)
    driver.execute_script("window.scrollTo(0, 0)")


def capture(name: str) -> tuple[str, str]:
    viewport_path = ARTIFACT_DIR / f"{name}.png"
    driver.save_screenshot(str(viewport_path))
    full_path = ARTIFACT_DIR / f"{name}-full.png"
    full_capture = driver.execute_cdp_cmd(
        "Page.captureScreenshot",
        {"format": "png", "captureBeyondViewport": True, "fromSurface": True},
    )
    full_path.write_bytes(base64.b64decode(full_capture["data"]))
    return str(viewport_path), str(full_path)


def severe_console_entries() -> list[str]:
    return [
        entry.get("message", "")
        for entry in driver.get_log("browser")
        if entry.get("level") == "SEVERE" and "favicon.ico" not in entry.get("message", "")
    ]


def grid_track_count(value: str) -> int:
    return len([part for part in value.split(" ") if part.strip()])


def assert_no_mutation_controls() -> None:
    for label in ("Nueva automatización", "Nueva versión", "Habilitar", "Deshabilitar", "Activar DRAFT"):
        matches = driver.find_elements(
            By.XPATH,
            f"//button[contains(normalize-space(.), '{label}')] | //a[contains(normalize-space(.), '{label}')]",
        )
        if any(node.is_displayed() for node in matches):
            raise AssertionError(f"Public demo exposed automation mutation control: {label}")


def assert_global_containment(surface: str, width: int, height: int) -> dict[str, object]:
    metrics = driver.execute_script(
        """
        const root = document.documentElement;
        const body = document.body;
        const page = document.querySelector(arguments[0]);
        const title = page?.querySelector('h1');
        const summary = page?.querySelector('.automations-r3-summary');
        const tableWrap = page?.querySelector('.automations-r3-table-wrap');
        const versionCard = page?.querySelector('.aa-version-card');
        return {
          innerWidth: window.innerWidth,
          scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
          pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
          titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
          summaryColumns: summary ? getComputedStyle(summary).gridTemplateColumns : '',
          tableScrollWidth: tableWrap ? tableWrap.scrollWidth : 0,
          tableClientWidth: tableWrap ? tableWrap.clientWidth : 0,
          versionScrollWidth: versionCard ? versionCard.scrollWidth : 0,
          versionClientWidth: versionCard ? versionCard.clientWidth : 0,
        };
        """,
        surface,
    )
    overflow = metrics["scrollWidth"] - metrics["innerWidth"]
    if overflow > TOLERANCE_PX:
        raise AssertionError(f"{surface} global overflow at {width}x{height}: {overflow}px")
    if width <= 620 and metrics["titleFont"] > 28:
        raise AssertionError(f"{surface} mobile title is oversized: {metrics['titleFont']}px")
    return {**metrics, "horizontalOverflow": overflow}


try:
    set_viewport(1366, 768)
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    admin_demo = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "button[data-demo-persona='administration']"))
    )
    admin_demo.click()
    wait.until(lambda d: "/operator/" in d.current_url and "/login" not in d.current_url)

    automations_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/admin/automations']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", automations_link)
    automations_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/automations"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".automations-r3-directory")))
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".automations-r3-table tbody tr")) == 6)

    page_text = driver.find_element(By.CSS_SELECTOR, ".automations-r3-directory").text
    for trigger in (
        "CLAIM_CREATED",
        "CLAIM_STATE_TRANSITIONED",
        "CLAIM_TASK_COMPLETED",
        "COMMUNICATION_DELIVERED",
        "INBOUND_EVENT_PROCESSED",
        "SCHEDULED_CHECK",
    ):
        if trigger not in page_text:
            raise AssertionError(f"Automation directory missing governed trigger: {trigger}")

    if len(driver.find_elements(By.CSS_SELECTOR, ".automations-r3-summary-card")) != 4:
        raise AssertionError("Automation directory must render four contract-derived summary cards")
    if driver.find_elements(By.CSS_SELECTOR, ".automations-r3-directory input[type='search']"):
        raise AssertionError("Automation directory must not invent a search control")
    if driver.find_elements(By.CSS_SELECTOR, ".automations-r3-directory select"):
        raise AssertionError("Automation directory must not invent filter or page-size selects")
    assert_no_mutation_controls()
    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = assert_global_containment(".automations-r3-directory", width, height)
        columns = grid_track_count(str(metrics["summaryColumns"]))
        expected_columns = 4 if width >= 1180 else 2 if width > 620 else 1
        if columns != expected_columns:
            raise AssertionError(
                f"Automation summary expected {expected_columns} columns at {width}px, got {metrics['summaryColumns']}"
            )
        shot, full = capture(f"automations-directory-{width}x{height}")
        results.append({
            "surface": "directory",
            "width": width,
            "height": height,
            **metrics,
            "summaryColumnCount": columns,
            "screenshot": shot,
            "fullPageScreenshot": full,
        })

    set_viewport(1366, 768)
    wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".automations-r3-name-cell a"))).click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/automations/{DEFINITION_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".automations-r3-detail")))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".automations-r3-readonly-badge")))
    assert_no_mutation_controls()

    if len(driver.find_elements(By.CSS_SELECTOR, ".automations-r3-detail .aa-version-card")) != 2:
        raise AssertionError("Governed automation detail must expose its two synthetic versions")
    if "solo lectura" not in driver.find_element(By.CSS_SELECTOR, ".automations-r3-readonly-badge").text.lower():
        raise AssertionError("Automation detail must disclose public demo read-only mode")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = assert_global_containment(".automations-r3-detail", width, height)
        shot, full = capture(f"automation-detail-{width}x{height}")
        results.append({
            "surface": "detail",
            "width": width,
            "height": height,
            **metrics,
            "screenshot": shot,
            "fullPageScreenshot": full,
        })

    errors = severe_console_entries()
    if errors:
        raise AssertionError(f"Severe browser console entries: {errors}")

    (ARTIFACT_DIR / "viewport-metrics.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({"status": "PASS", "surfaces": 2, "viewports": len(TARGETS)}, ensure_ascii=False))
finally:
    driver.quit()
