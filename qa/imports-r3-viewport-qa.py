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
IMPORT_JOB_ID = "a6000000-0000-4000-8000-000000000001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/imports-r3")
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
    for label in (
        "Nueva importación",
        "Generar preview",
        "Guardar mapping",
        "Validar filas",
        "Ejecutar dry-run",
        "Confirmar commit",
    ):
        matches = driver.find_elements(
            By.XPATH,
            f"//button[contains(normalize-space(.), '{label}')] | //a[contains(normalize-space(.), '{label}')]",
        )
        if any(node.is_displayed() for node in matches):
            raise AssertionError(f"Public demo exposed import mutation control: {label}")


def assert_global_containment(surface: str, width: int, height: int) -> dict[str, object]:
    metrics = driver.execute_script(
        """
        const root = document.documentElement;
        const body = document.body;
        const page = document.querySelector(arguments[0]);
        const title = page?.querySelector('h1');
        const summary = page?.querySelector('.imports-r3-summary');
        const tableWrap = page?.querySelector('.imports-r3-table-wrap, .gi-table-wrap');
        const mapping = page?.querySelector('.imports-r3-mapping-grid');
        return {
          innerWidth: window.innerWidth,
          scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
          pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
          titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
          summaryColumns: summary ? getComputedStyle(summary).gridTemplateColumns : '',
          mappingColumns: mapping ? getComputedStyle(mapping).gridTemplateColumns : '',
          tableScrollWidth: tableWrap ? tableWrap.scrollWidth : 0,
          tableClientWidth: tableWrap ? tableWrap.clientWidth : 0,
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

    imports_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/admin/imports']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", imports_link)
    imports_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/imports"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".imports-r3-directory")))
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".imports-r3-table tbody tr")) == 4)

    directory_text = driver.find_element(By.CSS_SELECTOR, ".imports-r3-directory").text
    for status in ("Completada", "Completada con errores", "Dry-run listo", "Validada"):
        if status not in directory_text:
            raise AssertionError(f"Imports directory missing governed status: {status}")

    if "DEMO PÚBLICA · SOLO LECTURA" not in directory_text:
        raise AssertionError("Imports directory must disclose public demo read-only mode")
    if len(driver.find_elements(By.CSS_SELECTOR, ".imports-r3-summary-card")) != 4:
        raise AssertionError("Imports directory must render four contract-derived summary cards")
    if driver.find_elements(By.CSS_SELECTOR, ".imports-r3-directory input[type='search']"):
        raise AssertionError("Imports directory must not invent a search control")
    if driver.find_elements(By.CSS_SELECTOR, ".imports-r3-directory select"):
        raise AssertionError("Imports directory must not invent filter or page-size selects")
    assert_no_mutation_controls()
    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = assert_global_containment(".imports-r3-directory", width, height)
        columns = grid_track_count(str(metrics["summaryColumns"]))
        expected_columns = 4 if width > 1100 else 2 if width > 760 else 1
        if columns != expected_columns:
            raise AssertionError(
                f"Imports summary expected {expected_columns} columns at {width}px, got {metrics['summaryColumns']}"
            )
        shot, full = capture(f"imports-directory-{width}x{height}")
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
    wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".imports-r3-type-cell a"))).click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/imports/{IMPORT_JOB_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".imports-r3-detail")))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".imports-r3-readonly-badge")))
    wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".imports-r3-rows tbody tr")) == 4)
    assert_no_mutation_controls()

    detail_text = driver.find_element(By.CSS_SELECTOR, ".imports-r3-detail").text
    normalized_detail_text = detail_text.casefold()
    for expected in ("Lifecycle", "Mapping aplicado", "Resultado por filas", "Solo lectura"):
        if expected.casefold() not in normalized_detail_text:
            raise AssertionError(f"Governed import detail missing: {expected}")
    if len(driver.find_elements(By.CSS_SELECTOR, ".imports-r3-mapping-grid > span")) != 3:
        raise AssertionError("Governed import detail must expose the three persisted mapping entries")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = assert_global_containment(".imports-r3-detail", width, height)
        mapping_columns = grid_track_count(str(metrics["mappingColumns"]))
        expected_mapping_columns = 3 if width > 760 else 1
        if mapping_columns != expected_mapping_columns:
            raise AssertionError(
                f"Imports mapping expected {expected_mapping_columns} columns at {width}px, got {metrics['mappingColumns']}"
            )
        shot, full = capture(f"import-detail-{width}x{height}")
        results.append({
            "surface": "detail",
            "width": width,
            "height": height,
            **metrics,
            "mappingColumnCount": mapping_columns,
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
