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
DEFINITION_ID = "communication-template-visual-001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/communication-templates-r3")
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


def select_option_values(selector: str) -> list[str | None]:
    select = driver.find_element(By.CSS_SELECTOR, selector)
    return [node.get_attribute("value") for node in select.find_elements(By.TAG_NAME, "option")]


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

    templates_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/admin/communication-templates']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", templates_link)
    templates_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/communication-templates"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".communication-templates-r3-directory")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Plantillas de comunicación']")))
    wait.until(lambda d: "claim.status.notice" in d.find_element(By.CSS_SELECTOR, ".comm-template-grid").text)
    wait.until(lambda d: "collection.reminder.whatsapp" in d.find_element(By.CSS_SELECTOR, ".comm-template-grid").text)
    wait.until(lambda d: "renewal.confirmation.email" in d.find_element(By.CSS_SELECTOR, ".comm-template-grid").text)

    directory_technical = driver.find_elements(By.CSS_SELECTOR, ".communication-templates-r3-directory .comm-technical-details")
    if len(directory_technical) != 3 or any(node.get_attribute("open") for node in directory_technical):
        raise AssertionError("Directory definition IDs must start collapsed behind technical disclosure")

    if driver.find_elements(By.XPATH, "//button[contains(normalize-space(.), 'Enviar')] | //a[contains(normalize-space(.), 'Enviar')]"):
        raise AssertionError("Communication Templates admin must not expose message sending actions")

    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.communication-templates-r3-directory');
            const title = page?.querySelector('h1');
            const grid = page?.querySelector('.comm-template-grid');
            const card = page?.querySelector('.comm-template-card');
            const primary = page?.querySelector('.comm-primary-button');
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
        shot, full = capture(f"communication-templates-directory-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Communication Templates directory horizontal overflow at {width}x{height}: {overflow}px")
        if grid_overflow > TOLERANCE_PX:
            raise AssertionError(f"Communication Templates directory grid overflow at {width}x{height}: {grid_overflow}px")
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Communication Templates desktop title is oversized: {metrics['titleFont']}px")
            if columns < 3:
                raise AssertionError(f"Communication Templates desktop directory lost three-column density: {metrics['gridColumns']}")
        elif width > 760:
            if columns != 2:
                raise AssertionError(f"Communication Templates tablet directory must use two columns: {metrics['gridColumns']}")
        else:
            if columns != 1:
                raise AssertionError(f"Communication Templates mobile directory must use one column: {metrics['gridColumns']}")
            if metrics["primaryHeight"] < 44:
                raise AssertionError(f"Communication Templates mobile create target is too short: {metrics['primaryHeight']}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Communication Templates mobile title is oversized: {metrics['titleFont']}px")

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
    detail_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".comm-template-card .comm-card-link")))
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/communication-templates/{DEFINITION_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".communication-templates-r3-detail")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='claim.status.notice']")))
    wait.until(lambda d: "control de concurrencia activo" in d.find_element(By.CSS_SELECTOR, ".comm-admin-actions").text.lower())

    draft_activate = driver.find_elements(By.CSS_SELECTOR, ".comm-version-card .comm-activate-button")
    if len(draft_activate) != 1:
        raise AssertionError(f"Expected activation only for one DRAFT template version, got {len(draft_activate)} buttons")

    technical = driver.find_elements(By.CSS_SELECTOR, ".communication-templates-r3-detail .comm-technical-details")
    if len(technical) != 3 or any(node.get_attribute("open") for node in technical):
        raise AssertionError("Definition/version IDs must start collapsed behind secondary technical disclosure")

    if driver.find_elements(By.XPATH, "//button[contains(normalize-space(.), 'Enviar')] | //a[contains(normalize-space(.), 'Enviar')]"):
        raise AssertionError("Communication Templates detail must not expose communications.send actions")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.communication-templates-r3-detail');
            const title = page?.querySelector('.comm-admin-hero h1');
            const facts = page?.querySelector('.comm-version-facts');
            const versionCard = page?.querySelector('.comm-version-card');
            const stateButton = page?.querySelector('.comm-state-button');
            const createButton = page?.querySelector('.comm-admin-actions .comm-primary-button');
            const activateButton = page?.querySelector('.comm-activate-button');
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
        shot, full = capture(f"communication-template-detail-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Communication Template detail horizontal overflow at {width}x{height}: {overflow}px")
        if card_overflow > TOLERANCE_PX:
            raise AssertionError(f"Communication Template version card overflow at {width}x{height}: {card_overflow}px")
        if width >= 1200:
            if fact_columns < 4:
                raise AssertionError(f"Desktop template version facts lost four-column density: {metrics['factColumns']}")
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Communication Template desktop detail title is oversized: {metrics['titleFont']}px")
        elif width > 760:
            if fact_columns != 2:
                raise AssertionError(f"Tablet template version facts must use two columns: {metrics['factColumns']}")
        else:
            if fact_columns != 1:
                raise AssertionError("Mobile template version facts must stack")
            for name, value in (("state", metrics["stateHeight"]), ("new version", metrics["createHeight"]), ("activate", metrics["activateHeight"])):
                if value < 44:
                    raise AssertionError(f"Communication Template mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Communication Template mobile detail title is oversized: {metrics['titleFont']}px")

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
    version_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".comm-admin-actions a.comm-primary-button"))
    )
    version_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/communication-templates/{DEFINITION_ID}/versions/new"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".communication-templates-r3-form-page")))
    wait.until(lambda d: "nueva versión inmutable" in d.find_element(By.CSS_SELECTOR, ".ops-kicker").text.lower())
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".comm-variable-row select")))
    variable_type_values = select_option_values(".comm-variable-row select")
    if variable_type_values != ["STRING", "NUMBER", "BOOLEAN"]:
        raise AssertionError(f"Version form published unsupported variable types: {variable_type_values}")
    assert_mobile_actions(
        ".communication-templates-r3-form-page button, .communication-templates-r3-form-page a.comm-primary-button, .communication-templates-r3-form-page a.comm-secondary-button",
        "Communication Template version form",
    )
    capture("communication-template-version-create-390x844")

    detail_back_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f".comm-breadcrumbs a[href='/operator/admin/communication-templates/{DEFINITION_ID}']"))
    )
    detail_back_link.click()
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".communication-templates-r3-detail")))
    directory_back_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".comm-breadcrumbs a[href='/operator/admin/communication-templates']"))
    )
    directory_back_link.click()
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".communication-templates-r3-directory")))
    create_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".comm-admin-page-heading a.comm-primary-button"))
    )
    create_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/admin/communication-templates/new"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".communication-templates-r3-form-page")))

    channel_values = select_option_values(".comm-form-grid select")
    if channel_values != ["EMAIL", "WHATSAPP"]:
        raise AssertionError(f"Template create form published unsupported channels: {channel_values}")

    add_variable = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".comm-variable-panel button.comm-secondary-button"))
    )
    add_variable.click()
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".comm-variable-row select")))
    create_variable_types = select_option_values(".comm-variable-row select")
    if create_variable_types != ["STRING", "NUMBER", "BOOLEAN"]:
        raise AssertionError(f"Template create form published unsupported variable types: {create_variable_types}")
    assert_mobile_actions(
        ".communication-templates-r3-form-page button, .communication-templates-r3-form-page a.comm-primary-button, .communication-templates-r3-form-page a.comm-secondary-button",
        "Communication Template create form",
    )
    capture("communication-template-create-390x844")

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
    "event": "COMMUNICATION_TEMPLATES_R3_VIEWPORT_PASS",
    "directoryViewports": directory_results,
    "detailViewports": detail_results,
}, ensure_ascii=False))
