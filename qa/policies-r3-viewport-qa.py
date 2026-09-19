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
POLICY_ID = "policy-visual-001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/policies-r3")
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
    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
    time.sleep(0.25)
    driver.execute_script("window.scrollTo(0, 0)")


def capture(name: str) -> tuple[str, str]:
    viewport_path = ARTIFACT_DIR / f"{name}.png"
    driver.save_screenshot(str(viewport_path))
    full_path = ARTIFACT_DIR / f"{name}-full.png"
    full_capture = driver.execute_cdp_cmd("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True, "fromSurface": True})
    full_path.write_bytes(base64.b64decode(full_capture["data"]))
    return str(viewport_path), str(full_path)


def track_count(value: str) -> int:
    return len([part for part in value.split(" ") if part.strip()])


def severe_console_entries() -> list[str]:
    return [entry.get("message", "") for entry in driver.get_log("browser") if entry.get("level") == "SEVERE" and "favicon.ico" not in entry.get("message", "")]


try:
    set_viewport(1366, 768)
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    wait.until(EC.visibility_of_element_located((By.ID, "operator-login"))).send_keys("demo.operator@eliasworks.invalid")
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    submit = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "form.operator-form button[type='submit']")))
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", submit)
    submit.click()
    wait.until(lambda d: "/operator/" in d.current_url and "/login" not in d.current_url)

    policies_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/policies']")))
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", policies_link)
    policies_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/policies"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-policy-directory")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Pólizas']")))
    wait.until(lambda d: "POL-80421" in d.find_element(By.CSS_SELECTOR, ".cp360-table").text)
    wait.until(lambda d: "María Fernández" in d.find_element(By.CSS_SELECTOR, ".cp360-table").text)
    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-policy-directory');
            const title = document.querySelector('.r3-policy-directory .cp360-page-heading h1');
            const switchLink = document.querySelector('.r3-policy-directory .cp360-switch-link');
            const toolbar = document.querySelector('.r3-policy-directory .cp360-toolbar');
            const searchInput = document.querySelector('#policy-search');
            const searchButton = document.querySelector('.r3-policy-directory .cp360-search button');
            const statusSelect = document.querySelector('.r3-policy-directory .cp360-filter select');
            const tableWrap = document.querySelector('.r3-policy-directory .cp360-table-wrap');
            const table = document.querySelector('.r3-policy-directory .cp360-table');
            const thead = document.querySelector('.r3-policy-directory .cp360-table thead');
            const row = document.querySelector('.r3-policy-directory .cp360-table tbody tr');
            const action = document.querySelector('.r3-policy-directory .cp360-row-action');
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              switchHeight: switchLink ? Math.round(switchLink.getBoundingClientRect().height) : 0,
              toolbarHeight: toolbar ? Math.round(toolbar.getBoundingClientRect().height) : 0,
              searchInputHeight: searchInput ? Math.round(searchInput.getBoundingClientRect().height) : 0,
              searchButtonHeight: searchButton ? Math.round(searchButton.getBoundingClientRect().height) : 0,
              statusSelectHeight: statusSelect ? Math.round(statusSelect.getBoundingClientRect().height) : 0,
              tableDisplay: table ? getComputedStyle(table).display : '',
              tableMinWidth: table ? getComputedStyle(table).minWidth : '',
              theadDisplay: thead ? getComputedStyle(thead).display : '',
              rowDisplay: row ? getComputedStyle(row).display : '',
              rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
              actionHeight: action ? Math.round(action.getBoundingClientRect().height) : 0,
              tableScrollWidth: tableWrap ? tableWrap.scrollWidth : 0,
              tableClientWidth: tableWrap ? tableWrap.clientWidth : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"policies-directory-{width}x{height}")
        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Policy directory horizontal overflow at {width}x{height}: {overflow}px")
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Policy directory title is oversized: {metrics['titleFont']}px")
            if metrics["toolbarHeight"] > 82:
                raise AssertionError(f"Policy directory toolbar wastes vertical space: {metrics['toolbarHeight']}px")
            if metrics["rowHeight"] > 72:
                raise AssertionError(f"Policy directory row lost approved density: {metrics['rowHeight']}px")
            if metrics["tableDisplay"] != "table":
                raise AssertionError(f"Desktop policy directory must remain a table: {metrics['tableDisplay']}")
        if width <= 1100:
            if metrics["theadDisplay"] != "none":
                raise AssertionError("Narrow policy directory must hide the table header and render cards")
            if metrics["rowDisplay"] != "grid":
                raise AssertionError(f"Narrow policy rows must render as cards: {metrics['rowDisplay']}")
            if metrics["tableScrollWidth"] - metrics["tableClientWidth"] > TOLERANCE_PX:
                raise AssertionError("Narrow policy directory must not rely on internal horizontal scrolling")
        if width <= 620:
            for name, value in (("customer switch", metrics["switchHeight"]), ("search input", metrics["searchInputHeight"]), ("search button", metrics["searchButtonHeight"]), ("status filter", metrics["statusSelectHeight"]), ("policy action", metrics["actionHeight"])):
                if value < 44:
                    raise AssertionError(f"Policy directory mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Policy directory mobile title is oversized: {metrics['titleFont']}px")
        directory_results.append({"width": width, "height": height, **metrics, "horizontalOverflow": overflow, "screenshot": shot, "fullPageScreenshot": full})

    set_viewport(1366, 768)
    detail_link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, f"a[href='/operator/policies/{POLICY_ID}']")))
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", detail_link)
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/policies/{POLICY_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-policy-detail")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Póliza 360']")))
    wait.until(lambda d: "SBC 2481" in d.find_element(By.CSS_SELECTOR, ".cp360-assets-grid").text)
    wait.until(lambda d: "CLM-2026-1842" in d.find_element(By.CSS_SELECTOR, ".cp360-claim-list").text)
    wait.until(lambda d: "No edita póliza" in d.find_element(By.CSS_SELECTOR, ".cp360-contract-note").text)

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-policy-detail');
            const title = document.querySelector('.r3-policy-detail .r3-policy-detail-title h1');
            const hero = document.querySelector('.r3-policy-detail .cp360-detail-hero');
            const detailGrid = document.querySelector('.r3-policy-detail .cp360-detail-grid');
            const customerAction = document.querySelector('.r3-policy-detail .cp360-customer-summary a');
            const claimRow = document.querySelector('.r3-policy-detail .cp360-claim-row');
            const assets = document.querySelector('.r3-policy-detail .cp360-assets-grid');
            const assetStyle = assets ? getComputedStyle(assets) : null;
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
              detailGridColumns: detailGrid ? getComputedStyle(detailGrid).gridTemplateColumns : '',
              assetGridColumns: assetStyle ? assetStyle.gridTemplateColumns : '',
              customerActionHeight: customerAction ? Math.round(customerAction.getBoundingClientRect().height) : 0,
              claimRowHeight: claimRow ? Math.round(claimRow.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"policy-360-{width}x{height}")
        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Policy 360 horizontal overflow at {width}x{height}: {overflow}px")
        columns = track_count(str(metrics["detailGridColumns"]))
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Policy 360 title is oversized: {metrics['titleFont']}px")
            if metrics["heroHeight"] > 165:
                raise AssertionError(f"Policy 360 hero wastes vertical space: {metrics['heroHeight']}px")
            if columns < 2:
                raise AssertionError(f"Desktop Policy 360 lost two-column relation composition: {metrics['detailGridColumns']}")
        elif width <= 1100 and columns != 1:
            raise AssertionError(f"Narrow Policy 360 must stack relation panels: {metrics['detailGridColumns']}")
        if width <= 620:
            if metrics["customerActionHeight"] and metrics["customerActionHeight"] < 44:
                raise AssertionError(f"Policy 360 mobile customer action is too short: {metrics['customerActionHeight']}px")
            if metrics["claimRowHeight"] < 44:
                raise AssertionError(f"Policy 360 mobile claim target is too short: {metrics['claimRowHeight']}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Policy 360 mobile title is oversized: {metrics['titleFont']}px")
        detail_results.append({"width": width, "height": height, **metrics, "horizontalOverflow": overflow, "screenshot": shot, "fullPageScreenshot": full})

    severe = severe_console_entries()
    if severe:
        raise AssertionError(f"Browser console contained severe errors: {severe[:10]}")
finally:
    try:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    except Exception:
        pass
    driver.quit()

print(json.dumps({"event": "POLICIES_R3_VIEWPORT_PASS", "directoryViewports": directory_results, "detailViewports": detail_results}, ensure_ascii=False))
