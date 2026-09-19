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
DEFINITION_ID = "00000000-0000-4000-8000-000000000401"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/custom-fields-r3")
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


def assert_mobile_actions(selector: str, context: str) -> None:
    for node in driver.find_elements(By.CSS_SELECTOR, selector):
        if node.is_displayed() and node.tag_name in {"button", "a"} and round(node.rect["height"]) < 44:
            raise AssertionError(f"{context} mobile action is too short: {node.rect['height']}px")


def select_option_values(selector: str, index: int = 0) -> list[str | None]:
    selects = driver.find_elements(By.CSS_SELECTOR, selector)
    if len(selects) <= index:
        raise AssertionError(f"Missing select {index} for selector {selector}")
    return [node.get_attribute("value") for node in selects[index].find_elements(By.TAG_NAME, "option")]


try:
    set_viewport(1366, 768)
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    wait.until(EC.visibility_of_element_located((By.ID, "operator-login"))).send_keys(
        "platform.admin@eliasworks.invalid"
    )
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    ).click()
    wait.until(lambda d: "/operator/" in d.current_url and "/login" not in d.current_url)

    fields_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/admin/custom-fields']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", fields_link)
    fields_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/custom-fields"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".custom-fields-r3-directory")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Campos personalizados']")))
    wait.until(lambda d: "claim.review_lane" in d.find_element(By.CSS_SELECTOR, ".cf-card-grid").text)
    wait.until(lambda d: "renewal.retention_score" in d.find_element(By.CSS_SELECTOR, ".cf-card-grid").text)
    wait.until(lambda d: "collection.contact_verified" in d.find_element(By.CSS_SELECTOR, ".cf-card-grid").text)

    if driver.find_elements(By.XPATH, "//button[contains(normalize-space(.), 'Eliminar')] | //a[contains(normalize-space(.), 'Eliminar')]"):
        raise AssertionError("Custom Fields directory must not expose delete actions")
    if driver.find_elements(By.CSS_SELECTOR, ".custom-fields-r3-directory input[type='search']"):
        raise AssertionError("Custom Fields directory must not invent a search control")

    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.custom-fields-r3-directory');
            const title = page?.querySelector('h1');
            const grid = page?.querySelector('.cf-card-grid');
            const card = page?.querySelector('.cf-definition-card');
            const primary = page?.querySelector('.cf-primary-button');
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
        shot, full = capture(f"custom-fields-directory-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Custom Fields directory horizontal overflow at {width}x{height}: {overflow}px")
        if grid_overflow > TOLERANCE_PX:
            raise AssertionError(f"Custom Fields directory grid overflow at {width}x{height}: {grid_overflow}px")
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Custom Fields desktop title is oversized: {metrics['titleFont']}px")
            if columns < 3:
                raise AssertionError(f"Custom Fields desktop directory lost three-column density: {metrics['gridColumns']}")
        elif width > 760:
            if columns != 2:
                raise AssertionError(f"Custom Fields tablet directory must use two columns: {metrics['gridColumns']}")
        else:
            if columns != 1:
                raise AssertionError(f"Custom Fields mobile directory must use one column: {metrics['gridColumns']}")
            if metrics["primaryHeight"] < 44:
                raise AssertionError(f"Custom Fields mobile create target is too short: {metrics['primaryHeight']}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Custom Fields mobile title is oversized: {metrics['titleFont']}px")

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
    detail_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".cf-definition-card .cf-card-link")))
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/custom-fields/{DEFINITION_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".custom-fields-r3-detail")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='claim.review_lane']")))
    wait.until(lambda d: "control de concurrencia activo" in d.find_element(By.CSS_SELECTOR, ".cf-admin-actions").text.lower())

    draft_activate = driver.find_elements(By.CSS_SELECTOR, ".cf-version-card .cf-activate-button")
    if len(draft_activate) != 1:
        raise AssertionError(f"Expected activation only for one DRAFT custom field version, got {len(draft_activate)} buttons")

    technical = driver.find_elements(By.CSS_SELECTOR, ".custom-fields-r3-detail .cf-technical-details")
    if len(technical) != 3 or any(node.get_attribute("open") for node in technical):
        raise AssertionError("Definition/version IDs must start collapsed behind technical disclosure")

    if driver.find_elements(By.XPATH, "//button[contains(normalize-space(.), 'Eliminar')] | //a[contains(normalize-space(.), 'Eliminar')]"):
        raise AssertionError("Custom Fields detail must not expose delete actions")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.custom-fields-r3-detail');
            const title = page?.querySelector('.cf-admin-hero h1');
            const facts = page?.querySelector('.cf-version-facts');
            const versionCard = page?.querySelector('.cf-version-card');
            const stateButton = page?.querySelector('.cf-state-button');
            const createButton = page?.querySelector('.cf-admin-actions .cf-primary-button');
            const activateButton = page?.querySelector('.cf-activate-button');
            return {
              innerWidth: window.innerWidth,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              factColumns: facts ? getComputedStyle(facts).gridTemplateColumns : '',
              versionCardScrollWidth: versionCard ? versionCard.scrollWidth : 0,
              versionCardClientWidth: versionCard ? versionCard.clientWidth : 0,
              stateHeight: stateButton ? Math.round(stateButton.getBoundingClientRect().height) : 0,
              createHeight: createButton ? Math.round(createButton.getBoundingClientRect().height) : 0,
              activateHeight: activateButton ? Math.round(activateButton.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        card_overflow = metrics["versionCardScrollWidth"] - metrics["versionCardClientWidth"]
        fact_columns = track_count(str(metrics["factColumns"]))
        shot, full = capture(f"custom-field-detail-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Custom Field detail horizontal overflow at {width}x{height}: {overflow}px")
        if card_overflow > TOLERANCE_PX:
            raise AssertionError(f"Custom Field version card overflow at {width}x{height}: {card_overflow}px")
        if width >= 1200:
            if fact_columns != 3:
                raise AssertionError(f"Desktop custom field version facts must use three columns: {metrics['factColumns']}")
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Custom Field desktop detail title is oversized: {metrics['titleFont']}px")
        elif width > 760:
            if fact_columns != 2:
                raise AssertionError(f"Tablet custom field version facts must use two columns: {metrics['factColumns']}")
        else:
            if fact_columns != 1:
                raise AssertionError("Mobile custom field version facts must stack")
            for name, value in (("state", metrics["stateHeight"]), ("new version", metrics["createHeight"]), ("activate", metrics["activateHeight"])):
                if value < 44:
                    raise AssertionError(f"Custom Field mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Custom Field mobile detail title is oversized: {metrics['titleFont']}px")

        detail_results.append({
            "width": width,
            "height": height,
            **metrics,
            "horizontalOverflow": overflow,
            "versionCardOverflow": card_overflow,
            "screenshot": shot,
            "fullPageScreenshot": full,
        })

    set_viewport(390, 844)
    version_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".cf-admin-actions a.cf-primary-button")))
    version_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/custom-fields/{DEFINITION_ID}/versions/new"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".custom-fields-r3-form-page")))
    wait.until(lambda d: "nueva versión inmutable" in d.find_element(By.CSS_SELECTOR, ".ops-kicker").text.lower())
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".cf-metadata-row")))

    version_value_types = select_option_values(".custom-fields-r3-form-page .cf-editor > .cf-form-grid select", 0)
    if version_value_types != ["STRING", "NUMBER", "BOOLEAN", "DATE", "ENUM"]:
        raise AssertionError(f"Version form published unsupported value types: {version_value_types}")
    version_sensitivity = select_option_values(".custom-fields-r3-form-page .cf-editor > .cf-form-grid select", 1)
    if version_sensitivity != ["PUBLIC_SAFE", "STAFF_ONLY"]:
        raise AssertionError(f"Version form published unsupported sensitivity values: {version_sensitivity}")
    metadata_types = select_option_values(".custom-fields-r3-form-page .cf-metadata-row label:nth-child(2) select", 0)
    if metadata_types != ["STRING", "NUMBER", "BOOLEAN"]:
        raise AssertionError(f"Version form published unsupported metadata scalar types: {metadata_types}")
    assert_mobile_actions(
        ".custom-fields-r3-form-page button, .custom-fields-r3-form-page a.cf-primary-button, .custom-fields-r3-form-page a.cf-secondary-button",
        "Custom Field version form",
    )
    capture("custom-field-version-create-390x844")

    detail_back_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f".cf-breadcrumbs a[href='/operator/admin/custom-fields/{DEFINITION_ID}']"))
    )
    detail_back_link.click()
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".custom-fields-r3-detail")))
    directory_back_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".cf-breadcrumbs a[href='/operator/admin/custom-fields']"))
    )
    directory_back_link.click()
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".custom-fields-r3-directory")))
    create_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".custom-fields-r3-directory .ops-page-heading a.cf-primary-button"))
    )
    create_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/custom-fields/new"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".custom-fields-r3-form-page")))

    target_values = select_option_values(".custom-fields-r3-form-page .cf-editor-panel > .cf-form-grid select", 0)
    if target_values != ["CLAIM", "RENEWAL", "COLLECTION"]:
        raise AssertionError(f"Custom Field create form published unsupported targets: {target_values}")
    create_value_types = select_option_values(".custom-fields-r3-form-page .cf-editor > .cf-form-grid select", 0)
    if create_value_types != ["STRING", "NUMBER", "BOOLEAN", "DATE", "ENUM"]:
        raise AssertionError(f"Custom Field create form published unsupported value types: {create_value_types}")
    create_sensitivity = select_option_values(".custom-fields-r3-form-page .cf-editor > .cf-form-grid select", 1)
    if create_sensitivity != ["PUBLIC_SAFE", "STAFF_ONLY"]:
        raise AssertionError(f"Custom Field create form published unsupported sensitivity values: {create_sensitivity}")

    add_metadata = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".cf-metadata-editor .cf-editor-heading button")))
    driver.execute_script("arguments[0].click();", add_metadata)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".cf-metadata-row")))
    create_metadata_types = select_option_values(".custom-fields-r3-form-page .cf-metadata-row label:nth-child(2) select", 0)
    if create_metadata_types != ["STRING", "NUMBER", "BOOLEAN"]:
        raise AssertionError(f"Custom Field create form published unsupported metadata scalar types: {create_metadata_types}")
    assert_mobile_actions(
        ".custom-fields-r3-form-page button, .custom-fields-r3-form-page a.cf-primary-button, .custom-fields-r3-form-page a.cf-secondary-button",
        "Custom Field create form",
    )
    capture("custom-field-create-390x844")

    severe = severe_console_entries()
    if severe:
        raise AssertionError(f"Severe browser console errors detected: {severe}")

    print(json.dumps({
        "event": "CUSTOM_FIELDS_R3_VIEWPORT_PASS",
        "directoryViewports": directory_results,
        "detailViewports": detail_results,
    }, ensure_ascii=False))
finally:
    driver.quit()
