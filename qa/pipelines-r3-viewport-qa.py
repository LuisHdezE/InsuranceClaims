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
DEFINITION_ID = "pipeline-definition-visual-001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/pipelines-r3")
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
directory_results: list[dict[str, object]] = []
detail_results: list[dict[str, object]] = []


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


def track_count(value: str) -> int:
    return len([part for part in value.split(" ") if part.strip()])


def severe_console_entries() -> list[str]:
    return [
        entry.get("message", "")
        for entry in driver.get_log("browser")
        if entry.get("level") == "SEVERE" and "favicon.ico" not in entry.get("message", "")
    ]


try:
    set_viewport(1366, 768)
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    wait.until(EC.visibility_of_element_located((By.ID, "operator-login"))).send_keys(
        "platform.admin@eliasworks.invalid"
    )
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    submit = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    )
    submit.click()
    wait.until(lambda d: "/operator/" in d.current_url and "/login" not in d.current_url)

    pipelines_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/admin/pipelines']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", pipelines_link)
    pipelines_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/pipelines"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".pipelines-r3-directory")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Pipelines']")))
    wait.until(lambda d: "Siniestros principal" in d.find_element(By.CSS_SELECTOR, ".pipeline-admin-grid").text)
    wait.until(lambda d: "Renovaciones principal" in d.find_element(By.CSS_SELECTOR, ".pipeline-admin-grid").text)
    wait.until(lambda d: "Cobranzas principal" in d.find_element(By.CSS_SELECTOR, ".pipeline-admin-grid").text)
    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.pipelines-r3-directory');
            const title = page?.querySelector('h1');
            const grid = page?.querySelector('.pipeline-admin-grid');
            const card = page?.querySelector('.pipeline-definition-card');
            const primary = page?.querySelector('.pipeline-primary-button');
            return {
              innerWidth: window.innerWidth,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : '',
              gridScrollWidth: grid ? grid.scrollWidth : 0,
              gridClientWidth: grid ? grid.clientWidth : 0,
              cardWidth: card ? Math.round(card.getBoundingClientRect().width) : 0,
              primaryHeight: primary ? Math.round(primary.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        grid_overflow = metrics["gridScrollWidth"] - metrics["gridClientWidth"]
        columns = track_count(str(metrics["gridColumns"]))
        shot, full = capture(f"pipelines-directory-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Pipelines directory horizontal overflow at {width}x{height}: {overflow}px")
        if grid_overflow > TOLERANCE_PX:
            raise AssertionError(f"Pipelines directory grid overflow at {width}x{height}: {grid_overflow}px")
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Pipelines desktop title is oversized: {metrics['titleFont']}px")
            if columns < 3:
                raise AssertionError(f"Pipelines desktop directory lost three-column density: {metrics['gridColumns']}")
        elif width > 760:
            if columns != 2:
                raise AssertionError(f"Pipelines tablet directory must use two columns: {metrics['gridColumns']}")
        else:
            if columns != 1:
                raise AssertionError(f"Pipelines mobile directory must use one column: {metrics['gridColumns']}")
            if metrics["primaryHeight"] < 44:
                raise AssertionError(f"Pipelines mobile create target is too short: {metrics['primaryHeight']}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Pipelines mobile title is oversized: {metrics['titleFont']}px")

        directory_results.append({
            "width": width,
            "height": height,
            **metrics,
            "horizontalOverflow": overflow,
            "gridOverflow": grid_overflow,
            "screenshot": shot,
            "fullPageScreenshot": full,
        })

    set_viewport(1366, 768)
    detail_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".pipeline-definition-card")))
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/pipelines/{DEFINITION_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".pipelines-r3-detail")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Siniestros principal']")))
    wait.until(lambda d: "definición de pipeline r3" in d.find_element(By.CSS_SELECTOR, ".pipeline-admin-hero").text.lower())
    wait.until(lambda d: "control de concurrencia activo" in d.find_element(By.CSS_SELECTOR, ".pipeline-admin-actions").text.lower())

    draft_activate = driver.find_elements(By.CSS_SELECTOR, ".pipeline-version-card .pipeline-activate-button")
    if len(draft_activate) != 1:
        raise AssertionError(f"Expected activation only for one DRAFT version, got {len(draft_activate)} buttons")

    technical = driver.find_elements(By.CSS_SELECTOR, ".pipeline-technical-details")
    if len(technical) != 2 or any(node.get_attribute("open") for node in technical):
        raise AssertionError("Version UUIDs must start collapsed behind secondary technical disclosure")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.pipelines-r3-detail');
            const title = page?.querySelector('.pipeline-admin-hero h1');
            const facts = page?.querySelector('.pipeline-version-facts');
            const stageMap = page?.querySelector('.pipeline-stage-map');
            const stateButton = page?.querySelector('.pipeline-state-button');
            const createButton = page?.querySelector('.pipeline-admin-actions .pipeline-primary-button');
            const activateButton = page?.querySelector('.pipeline-activate-button');
            return {
              innerWidth: window.innerWidth,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              factColumns: facts ? getComputedStyle(facts).gridTemplateColumns : '',
              stageColumns: stageMap ? getComputedStyle(stageMap).gridTemplateColumns : '',
              stageScrollWidth: stageMap ? stageMap.scrollWidth : 0,
              stageClientWidth: stageMap ? stageMap.clientWidth : 0,
              stateHeight: stateButton ? Math.round(stateButton.getBoundingClientRect().height) : 0,
              createHeight: createButton ? Math.round(createButton.getBoundingClientRect().height) : 0,
              activateHeight: activateButton ? Math.round(activateButton.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        stage_overflow = metrics["stageScrollWidth"] - metrics["stageClientWidth"]
        fact_columns = track_count(str(metrics["factColumns"]))
        stage_columns = track_count(str(metrics["stageColumns"]))
        shot, full = capture(f"pipeline-detail-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Pipeline detail horizontal overflow at {width}x{height}: {overflow}px")
        if stage_overflow > TOLERANCE_PX:
            raise AssertionError(f"Pipeline detail stage-map overflow at {width}x{height}: {stage_overflow}px")
        if width >= 1200:
            if fact_columns < 4:
                raise AssertionError(f"Desktop pipeline facts lost compact four-column layout: {metrics['factColumns']}")
            if stage_columns < 3:
                raise AssertionError(f"Desktop pipeline stage map is too sparse: {metrics['stageColumns']}")
        elif width > 760:
            if fact_columns != 2:
                raise AssertionError(f"Tablet pipeline facts must use two columns: {metrics['factColumns']}")
            if stage_columns != 2:
                raise AssertionError(f"Tablet pipeline stage map must use two columns: {metrics['stageColumns']}")
        else:
            if fact_columns != 1 or stage_columns != 1:
                raise AssertionError("Mobile pipeline detail must stack facts and stages")
            for name, value in (("state", metrics["stateHeight"]), ("new version", metrics["createHeight"]), ("activate", metrics["activateHeight"])):
                if value < 44:
                    raise AssertionError(f"Pipeline mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Pipeline mobile detail title is oversized: {metrics['titleFont']}px")

        detail_results.append({
            "width": width,
            "height": height,
            **metrics,
            "horizontalOverflow": overflow,
            "stageOverflow": stage_overflow,
            "screenshot": shot,
            "fullPageScreenshot": full,
        })

    set_viewport(390, 844)
    version_create_link = wait.until(EC.element_to_be_clickable((
        By.CSS_SELECTOR,
        f"a.pipeline-primary-button[href='/operator/admin/pipelines/{DEFINITION_ID}/versions/new']",
    )))
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", version_create_link)
    version_create_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/pipelines/{DEFINITION_ID}/versions/new"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".pipelines-r3-form-page")))
    wait.until(lambda d: "versión de configuración inmutable" in d.find_element(By.CSS_SELECTOR, ".pipeline-admin-page-heading").text.lower())
    capture("pipeline-version-create-390x844")

    directory_breadcrumb = wait.until(EC.element_to_be_clickable((
        By.CSS_SELECTOR,
        "a[href='/operator/admin/pipelines']",
    )))
    directory_breadcrumb.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/pipelines"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".pipelines-r3-directory")))

    create_pipeline_link = wait.until(EC.element_to_be_clickable((
        By.CSS_SELECTOR,
        "a.pipeline-primary-button[href='/operator/admin/pipelines/new']",
    )))
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", create_pipeline_link)
    create_pipeline_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/pipelines/new"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".pipelines-r3-form-page")))
    options_values = [node.get_attribute("value") for node in driver.find_elements(By.CSS_SELECTOR, "select option")]
    if options_values != ["CLAIM", "RENEWAL", "COLLECTION"]:
        raise AssertionError(f"Pipeline create form published unsupported consumers: {options_values}")
    create_inputs = driver.find_elements(By.CSS_SELECTOR, ".pipelines-r3-form-page input, .pipelines-r3-form-page select, .pipelines-r3-form-page button, .pipelines-r3-form-page a.pipeline-secondary-button")
    for node in create_inputs:
        if node.is_displayed() and round(node.rect["height"]) < 44 and node.tag_name in {"button", "a"}:
            raise AssertionError(f"Pipeline create mobile action is too short: {node.rect['height']}px")
    capture("pipeline-create-390x844")

    severe = severe_console_entries()
    if severe:
        raise AssertionError(f"Browser console contained severe errors: {severe[:10]}")
finally:
    try:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    except Exception:
        pass
    driver.quit()

print(json.dumps({
    "event": "PIPELINES_R3_VIEWPORT_PASS",
    "directoryViewports": directory_results,
    "detailViewports": detail_results,
}, ensure_ascii=False))
