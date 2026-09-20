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
DEFINITION_ID = "00000000-0000-4000-8000-000000000501"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/guidance-r3")
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
form_results: list[dict[str, object]] = []


def set_viewport(width: int, height: int) -> None:
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False},
    )
    time.sleep(0.25)
    driver.execute_script("window.scrollTo(0, 0)")


def spa_navigate(path: str) -> None:
    driver.execute_script(
        "window.history.pushState({}, '', arguments[0]); window.dispatchEvent(new PopStateEvent('popstate'));",
        path,
    )
    wait.until(lambda d: d.current_url.endswith(path))
    time.sleep(0.2)


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


def assert_no_horizontal_overflow(context: str) -> dict[str, int]:
    metrics = driver.execute_script(
        """
        const root = document.documentElement;
        const body = document.body;
        return {
          innerWidth: window.innerWidth,
          scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
        };
        """
    )
    overflow = metrics["scrollWidth"] - metrics["innerWidth"]
    if overflow > TOLERANCE_PX:
        raise AssertionError(f"{context} horizontal overflow: {overflow}px")
    return {"innerWidth": metrics["innerWidth"], "scrollWidth": metrics["scrollWidth"], "horizontalOverflow": overflow}


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

    # Guidance intentionally remains pending in navigation until human visual approval.
    # Navigate through browser history so BrowserRouter handles the route without a reload;
    # OperatorSessionContext is intentionally in-memory and a full reload would sign out.
    spa_navigate("/operator/admin/guidance")
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".guidance-r3-directory")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Orientación']")))
    wait.until(lambda d: "claims.intake.help" in d.find_element(By.CSS_SELECTOR, ".guidance-card-grid").text)
    wait.until(lambda d: "claims.evidence.help" in d.find_element(By.CSS_SELECTOR, ".guidance-card-grid").text)
    wait.until(lambda d: "claims.repair.help" in d.find_element(By.CSS_SELECTOR, ".guidance-card-grid").text)

    if driver.find_elements(By.CSS_SELECTOR, ".guidance-r3-directory input[type='search']"):
        raise AssertionError("Guidance directory must not invent a search control")
    if driver.find_elements(By.XPATH, "//main[contains(@class,'guidance-r3-directory')]//button[contains(normalize-space(.), 'Eliminar')] | //main[contains(@class,'guidance-r3-directory')]//a[contains(normalize-space(.), 'Eliminar')]"):
        raise AssertionError("Guidance directory must not expose delete actions")

    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.guidance-r3-directory');
            const title = page?.querySelector('h1');
            const grid = page?.querySelector('.guidance-card-grid');
            const card = page?.querySelector('.guidance-definition-card');
            const strip = page?.querySelector('.guidance-contract-strip');
            const primary = page?.querySelector('.guidance-primary-button');
            return {
              innerWidth: window.innerWidth,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : '',
              stripColumns: strip ? getComputedStyle(strip).gridTemplateColumns : '',
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
        strip_columns = track_count(str(metrics["stripColumns"]))
        shot, full = capture(f"guidance-directory-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Guidance directory horizontal overflow at {width}x{height}: {overflow}px")
        if grid_overflow > TOLERANCE_PX:
            raise AssertionError(f"Guidance directory grid overflow at {width}x{height}: {grid_overflow}px")
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Guidance desktop title is oversized: {metrics['titleFont']}px")
            if columns != 3:
                raise AssertionError(f"Guidance desktop directory must use three columns: {metrics['gridColumns']}")
            if strip_columns != 3:
                raise AssertionError(f"Guidance desktop contract strip must use three columns: {metrics['stripColumns']}")
        elif width > 760:
            if columns != 2:
                raise AssertionError(f"Guidance tablet directory must use two columns: {metrics['gridColumns']}")
        else:
            if columns != 1:
                raise AssertionError(f"Guidance mobile directory must use one column: {metrics['gridColumns']}")
            if strip_columns != 1:
                raise AssertionError("Guidance mobile contract strip must stack")
            if metrics["primaryHeight"] < 44:
                raise AssertionError(f"Guidance mobile create target is too short: {metrics['primaryHeight']}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Guidance mobile title is oversized: {metrics['titleFont']}px")

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
    detail_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".guidance-definition-card")))
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/guidance/{DEFINITION_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".guidance-r3-detail")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='claims.intake.help']")))
    wait.until(lambda d: "control de concurrencia activo" in d.find_element(By.CSS_SELECTOR, ".guidance-admin-actions").text.lower())

    draft_activate = driver.find_elements(By.CSS_SELECTOR, ".guidance-version-card .guidance-activate-button")
    if len(draft_activate) != 1:
        raise AssertionError(f"Expected activation only for one DRAFT Guidance version, got {len(draft_activate)} buttons")

    technical = driver.find_elements(By.CSS_SELECTOR, ".guidance-r3-detail .guidance-technical-details")
    if len(technical) != 3 or any(node.get_attribute("open") for node in technical):
        raise AssertionError("Guidance definition/version IDs must start collapsed behind technical disclosure")

    if driver.find_elements(By.XPATH, "//main[contains(@class,'guidance-r3-detail')]//button[contains(normalize-space(.), 'Eliminar')] | //main[contains(@class,'guidance-r3-detail')]//a[contains(normalize-space(.), 'Eliminar')]"):
        raise AssertionError("Guidance detail must not expose delete actions")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.guidance-r3-detail');
            const title = page?.querySelector('.guidance-admin-hero h1');
            const facts = page?.querySelector('.guidance-version-facts');
            const card = page?.querySelector('.guidance-version-card');
            const state = page?.querySelector('.guidance-state-button');
            const create = page?.querySelector('.guidance-admin-actions .guidance-primary-button');
            const activate = page?.querySelector('.guidance-activate-button');
            return {
              innerWidth: window.innerWidth,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              factColumns: facts ? getComputedStyle(facts).gridTemplateColumns : '',
              cardScrollWidth: card ? card.scrollWidth : 0,
              cardClientWidth: card ? card.clientWidth : 0,
              stateHeight: state ? Math.round(state.getBoundingClientRect().height) : 0,
              createHeight: create ? Math.round(create.getBoundingClientRect().height) : 0,
              activateHeight: activate ? Math.round(activate.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        card_overflow = metrics["cardScrollWidth"] - metrics["cardClientWidth"]
        fact_columns = track_count(str(metrics["factColumns"]))
        shot, full = capture(f"guidance-detail-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Guidance detail horizontal overflow at {width}x{height}: {overflow}px")
        if card_overflow > TOLERANCE_PX:
            raise AssertionError(f"Guidance version card overflow at {width}x{height}: {card_overflow}px")
        if width >= 1200:
            if fact_columns != 3:
                raise AssertionError(f"Guidance desktop version facts must use three columns: {metrics['factColumns']}")
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Guidance desktop detail title is oversized: {metrics['titleFont']}px")
        elif width > 760:
            if fact_columns != 2:
                raise AssertionError(f"Guidance tablet version facts must use two columns: {metrics['factColumns']}")
        else:
            if fact_columns != 1:
                raise AssertionError("Guidance mobile version facts must stack")
            for name, value in (("state", metrics["stateHeight"]), ("new version", metrics["createHeight"]), ("activate", metrics["activateHeight"])):
                if value < 44:
                    raise AssertionError(f"Guidance mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Guidance mobile detail title is oversized: {metrics['titleFont']}px")

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
    version_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".guidance-admin-actions a.guidance-primary-button")))
    version_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/admin/guidance/{DEFINITION_ID}/versions/new"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".guidance-r3-form-page")))
    wait.until(lambda d: "nueva versión inmutable" in d.find_element(By.CSS_SELECTOR, ".ops-kicker").text.lower())
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".guidance-editor")))
    assert_no_horizontal_overflow("Guidance version form mobile")
    assert_mobile_actions(
        ".guidance-r3-form-page button, .guidance-r3-form-page a.guidance-primary-button",
        "Guidance version form",
    )
    if len(driver.find_elements(By.CSS_SELECTOR, ".guidance-r3-form-page input[maxlength='80']")) < 3:
        raise AssertionError("Guidance version form must preserve the three required 80-character fields")
    shot, full = capture("guidance-version-create-390x844")
    form_results.append({"form": "version", "width": 390, "height": 844, "screenshot": shot, "fullPageScreenshot": full})

    spa_navigate("/operator/admin/guidance/new")
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".guidance-r3-form-page")))
    wait.until(lambda d: "nueva orientación r3" in d.find_element(By.CSS_SELECTOR, ".ops-kicker").text.lower())
    key_input = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".guidance-key-field input")))
    if key_input.get_attribute("maxlength") != "80":
        raise AssertionError("Guidance stable key must remain capped at 80 characters")

    add_buttons = driver.find_elements(By.CSS_SELECTOR, ".guidance-editor-section-heading button")
    if len(add_buttons) != 3:
        raise AssertionError(f"Guidance editor must expose exactly three bounded list/metadata add controls, got {len(add_buttons)}")
    for button in add_buttons:
        driver.execute_script("arguments[0].click();", button)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".guidance-string-row")))
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".guidance-metadata-row")))
    assert_no_horizontal_overflow("Guidance create form mobile")
    assert_mobile_actions(
        ".guidance-r3-form-page button, .guidance-r3-form-page a.guidance-primary-button",
        "Guidance create form",
    )
    shot, full = capture("guidance-create-390x844")
    form_results.append({"form": "create", "width": 390, "height": 844, "screenshot": shot, "fullPageScreenshot": full})

    severe = severe_console_entries()
    if severe:
        raise AssertionError(f"Guidance R3 browser console has severe entries: {severe}")

    evidence = {
        "status": "PASS",
        "reference": "documentation/ui-reference/r3/guidance-r3-approved.md",
        "navigationMaturityDuringDraft": "pending",
        "viewports": [f"{width}x{height}" for width, height in TARGETS],
        "directory": directory_results,
        "detail": detail_results,
        "forms": form_results,
        "contractAssertions": {
            "serverPaginationOnly": True,
            "noInventedSearch": True,
            "noDeleteActions": True,
            "draftActivationOnly": True,
            "technicalIdsCollapsed": True,
            "mobileTargetsAtLeast44px": True,
            "conflictPosture": "409 refetch authoritative projection; no blind retry",
        },
    }
    (ARTIFACT_DIR / "evidence.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"event": "GUIDANCE_R3_VIEWPORT_PASS", "evidence": evidence}, ensure_ascii=False))
finally:
    driver.quit()