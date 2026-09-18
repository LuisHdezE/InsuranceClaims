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
CUSTOMER_ID = "customer-visual-001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/customers-r3")
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
        "demo.operator@eliasworks.invalid"
    )
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    submit = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", submit)
    submit.click()
    wait.until(lambda d: "/operator/" in d.current_url and "/login" not in d.current_url)

    customers_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/customers']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", customers_link)
    customers_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/customers"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-customer-directory")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Clientes']")))
    wait.until(lambda d: "María Fernández" in d.find_element(By.CSS_SELECTOR, ".cp360-table").text)
    wait.until(lambda d: "CUS-2026-1042" in d.find_element(By.CSS_SELECTOR, ".cp360-table").text)

    # Ignore transient console noise from the post-login landing route before Customers is opened.
    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-customer-directory');
            const title = document.querySelector('.r3-customer-directory .cp360-page-heading h1');
            const switchLink = document.querySelector('.r3-customer-directory .cp360-switch-link');
            const toolbar = document.querySelector('.r3-customer-directory .cp360-toolbar');
            const searchInput = document.querySelector('#customer-search');
            const searchButton = document.querySelector('.r3-customer-directory .cp360-search button');
            const statusSelect = document.querySelector('.r3-customer-directory .cp360-filter select');
            const tableWrap = document.querySelector('.r3-customer-directory .cp360-table-wrap');
            const table = document.querySelector('.r3-customer-directory .cp360-table');
            const thead = document.querySelector('.r3-customer-directory .cp360-table thead');
            const row = document.querySelector('.r3-customer-directory .cp360-table tbody tr');
            const action = document.querySelector('.r3-customer-directory .cp360-row-action');
            const tableStyle = table ? getComputedStyle(table) : null;
            const headStyle = thead ? getComputedStyle(thead) : null;
            const rowStyle = row ? getComputedStyle(row) : null;
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
              tableDisplay: tableStyle ? tableStyle.display : '',
              tableMinWidth: tableStyle ? tableStyle.minWidth : '',
              theadDisplay: headStyle ? headStyle.display : '',
              rowDisplay: rowStyle ? rowStyle.display : '',
              rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
              actionHeight: action ? Math.round(action.getBoundingClientRect().height) : 0,
              tableScrollWidth: tableWrap ? tableWrap.scrollWidth : 0,
              tableClientWidth: tableWrap ? tableWrap.clientWidth : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"customers-directory-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Customer directory horizontal overflow at {width}x{height}: {overflow}px")

        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Customer directory title is oversized: {metrics['titleFont']}px")
            if metrics["toolbarHeight"] > 82:
                raise AssertionError(f"Customer directory toolbar wastes vertical space: {metrics['toolbarHeight']}px")
            if metrics["rowHeight"] > 72:
                raise AssertionError(f"Customer directory row lost approved density: {metrics['rowHeight']}px")
            if metrics["tableDisplay"] != "table":
                raise AssertionError(f"Desktop customer directory must remain a table: {metrics['tableDisplay']}")
        if width <= 620:
            if metrics["theadDisplay"] != "none":
                raise AssertionError("Mobile customer directory must hide the table header and render rows as cards")
            if metrics["rowDisplay"] != "grid":
                raise AssertionError(f"Mobile customer rows must render as compact cards: {metrics['rowDisplay']}")
            for name, value in (
                ("policy switch", metrics["switchHeight"]),
                ("search input", metrics["searchInputHeight"]),
                ("search button", metrics["searchButtonHeight"]),
                ("status filter", metrics["statusSelectHeight"]),
                ("customer action", metrics["actionHeight"]),
            ):
                if value < 44:
                    raise AssertionError(f"Customer directory mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Customer directory mobile title is oversized: {metrics['titleFont']}px")

        directory_results.append(
            {
                "width": width,
                "height": height,
                **metrics,
                "horizontalOverflow": overflow,
                "screenshot": shot,
                "fullPageScreenshot": full,
            }
        )

    set_viewport(1366, 768)
    detail_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f"a[href='/operator/customers/{CUSTOMER_ID}']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", detail_link)
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/customers/{CUSTOMER_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-customer-detail")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Cliente 360']")))
    wait.until(lambda d: "POL-80421" in d.find_element(By.CSS_SELECTOR, ".cp360-card-list").text)
    wait.until(lambda d: "CLM-2026-1842" in d.find_element(By.CSS_SELECTOR, ".cp360-claim-list").text)
    wait.until(lambda d: "No edita cliente" in d.find_element(By.CSS_SELECTOR, ".cp360-contract-note").text)

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-customer-detail');
            const title = document.querySelector('.r3-customer-detail .r3-customer-detail-title h1');
            const hero = document.querySelector('.r3-customer-detail .cp360-detail-hero');
            const detailGrid = document.querySelector('.r3-customer-detail .cp360-detail-grid');
            const detailGridStyle = detailGrid ? getComputedStyle(detailGrid) : null;
            const policyAction = document.querySelector('.r3-customer-detail .cp360-card-action');
            const claimRow = document.querySelector('.r3-customer-detail .cp360-claim-row');
            const contract = document.querySelector('.r3-customer-detail .cp360-contract-note');
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
              detailGridColumns: detailGridStyle ? detailGridStyle.gridTemplateColumns : '',
              policyActionHeight: policyAction ? Math.round(policyAction.getBoundingClientRect().height) : 0,
              claimRowHeight: claimRow ? Math.round(claimRow.getBoundingClientRect().height) : 0,
              contractHeight: contract ? Math.round(contract.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"customer-360-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Customer 360 horizontal overflow at {width}x{height}: {overflow}px")

        columns = track_count(str(metrics["detailGridColumns"]))
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Customer 360 title is oversized: {metrics['titleFont']}px")
            if metrics["heroHeight"] > 150:
                raise AssertionError(f"Customer 360 hero wastes vertical space: {metrics['heroHeight']}px")
            if columns < 2:
                raise AssertionError(f"Desktop Customer 360 lost two-column relations: {metrics['detailGridColumns']}")
        elif width <= 1100 and columns != 1:
            raise AssertionError(f"Narrow Customer 360 must stack relations: {metrics['detailGridColumns']}")

        if width <= 620:
            if metrics["policyActionHeight"] < 44:
                raise AssertionError(f"Customer 360 mobile policy action is too short: {metrics['policyActionHeight']}px")
            if metrics["claimRowHeight"] < 44:
                raise AssertionError(f"Customer 360 mobile claim target is too short: {metrics['claimRowHeight']}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Customer 360 mobile title is oversized: {metrics['titleFont']}px")

        detail_results.append(
            {
                "width": width,
                "height": height,
                **metrics,
                "horizontalOverflow": overflow,
                "screenshot": shot,
                "fullPageScreenshot": full,
            }
        )

    severe = severe_console_entries()
    if severe:
        raise AssertionError(f"Browser console contained severe errors: {severe[:10]}")
finally:
    try:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    except Exception:
        pass
    driver.quit()

print(
    json.dumps(
        {
            "event": "CUSTOMERS_R3_VIEWPORT_PASS",
            "directoryViewports": directory_results,
            "detailViewports": detail_results,
        },
        ensure_ascii=False,
    )
)
