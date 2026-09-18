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
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/claims-workspace")
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
        {
            "width": width,
            "height": height,
            "deviceScaleFactor": 1,
            "mobile": False,
        },
    )
    time.sleep(0.3)
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


try:
    set_viewport(1366, 768)
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    wait.until(EC.visibility_of_element_located((By.ID, "operator-login"))).send_keys(
        "demo.operator@eliasworks.invalid"
    )
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    submit = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", submit)
    wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    ).click()

    wait.until(lambda d: "/operator/claims" in d.current_url)
    wait.until(lambda d: "Gestión de siniestros" in d.find_element(By.TAG_NAME, "body").text)
    wait.until(lambda d: "SYN-QA-BULK-TRACK-001" in d.find_element(By.TAG_NAME, "body").text)

    for width, height in TARGETS:
        set_viewport(width, height)

        # Kanban is the canonical default representation.
        kanban_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Kanban')]")))
        if kanban_button.get_attribute("aria-pressed") != "true":
            kanban_button.click()
            wait.until(lambda d: d.find_element(By.CSS_SELECTOR, ".ops-kanban").is_displayed())
            time.sleep(0.2)

        kanban_metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const heading = document.querySelector('.r3-workspace-page .ops-page-heading h1');
            const control = document.querySelector('.r3-workspace-page .r3-claims-search input');
            const columnHeading = document.querySelector('.r3-workspace-page .ops-kanban-heading');
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              headingFont: heading ? parseFloat(getComputedStyle(heading).fontSize) : 0,
              controlHeight: control ? Math.round(control.getBoundingClientRect().height) : 0,
              columnHeadingHeight: columnHeading ? Math.round(columnHeading.getBoundingClientRect().height) : 0,
            };
            """
        )
        kanban_overflow = kanban_metrics["scrollWidth"] - kanban_metrics["innerWidth"]
        kanban_shot, kanban_full = capture(f"claims-workspace-kanban-{width}x{height}")

        if kanban_overflow > TOLERANCE_PX:
            raise AssertionError(
                f"Claims Kanban page overflow at {width}x{height}: {kanban_overflow}px"
            )
        if width >= 1024:
            if kanban_metrics["headingFont"] > 30:
                raise AssertionError(f"Claims heading is oversized at {width}px: {kanban_metrics['headingFont']}px")
            if kanban_metrics["controlHeight"] > 40:
                raise AssertionError(f"Claims desktop filter control is too tall: {kanban_metrics['controlHeight']}px")
            if kanban_metrics["columnHeadingHeight"] > 76:
                raise AssertionError(f"Kanban column heading is too tall: {kanban_metrics['columnHeadingHeight']}px")
        elif width <= 720 and kanban_metrics["controlHeight"] < 44:
            raise AssertionError(f"Claims mobile filter touch target is too short: {kanban_metrics['controlHeight']}px")

        # Validate the same capability in List representation.
        list_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Lista')]")))
        list_button.click()
        wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".claims-table")))
        wait.until(lambda d: "IC-FUW5DaoFvfUvSmuxMvwwID_Fe" in d.find_element(By.TAG_NAME, "body").text)
        time.sleep(0.2)
        driver.execute_script("window.scrollTo(0, 0)")

        list_metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const table = document.querySelector('.r3-workspace-page .claims-table');
            const row = document.querySelector('.r3-workspace-page .claims-table tbody tr');
            const cell = document.querySelector('.r3-workspace-page .claims-table tbody td');
            const tracking = document.querySelector('.r3-workspace-page .claims-table tbody td:first-child strong');
            const th = document.querySelector('.r3-workspace-page .claims-table thead th');
            const badge = document.querySelector('.r3-workspace-page .claims-table .status-badge');
            const cells = row ? Array.from(row.querySelectorAll('td')) : [];
            const detail = row ? row.querySelector('.ops-card-link') : null;
            const rowRect = row ? row.getBoundingClientRect() : null;
            const detailRect = detail ? detail.getBoundingClientRect() : null;
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              tableFont: table ? parseFloat(getComputedStyle(table).fontSize) : 0,
              rowHeight: row ? Math.round(rowRect.height) : 0,
              rowClientHeight: row ? row.clientHeight : 0,
              rowScrollHeight: row ? row.scrollHeight : 0,
              visibleCellCount: cells.filter((node) => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0;
              }).length,
              detailVisible: Boolean(
                detail &&
                getComputedStyle(detail).display !== 'none' &&
                getComputedStyle(detail).visibility !== 'hidden' &&
                detailRect &&
                rowRect &&
                detailRect.bottom <= rowRect.bottom + 1
              ),
              cellFont: cell ? parseFloat(getComputedStyle(cell).fontSize) : 0,
              trackingFont: tracking ? parseFloat(getComputedStyle(tracking).fontSize) : 0,
              headerFont: th ? parseFloat(getComputedStyle(th).fontSize) : 0,
              badgeFont: badge ? parseFloat(getComputedStyle(badge).fontSize) : 0,
            };
            """
        )
        list_overflow = list_metrics["scrollWidth"] - list_metrics["innerWidth"]
        list_shot, list_full = capture(f"claims-workspace-list-{width}x{height}")

        if list_overflow > TOLERANCE_PX:
            raise AssertionError(
                f"Claims List page overflow at {width}x{height}: {list_overflow}px"
            )
        if width >= 1024:
            if list_metrics["tableFont"] > 13:
                raise AssertionError(f"Claims table font is too large: {list_metrics['tableFont']}px")
            if list_metrics["trackingFont"] > 14:
                raise AssertionError(f"Claims tracking font is too large: {list_metrics['trackingFont']}px")
            if list_metrics["headerFont"] > 11:
                raise AssertionError(f"Claims table header font is too large: {list_metrics['headerFont']}px")
            if list_metrics["badgeFont"] > 11:
                raise AssertionError(f"Claims status badge font is too large: {list_metrics['badgeFont']}px")
            if list_metrics["rowHeight"] > 68:
                raise AssertionError(f"Claims desktop row wastes vertical space: {list_metrics['rowHeight']}px")
        elif width <= 520:
            if list_metrics["visibleCellCount"] < 7:
                raise AssertionError(
                    f"Claims mobile record hides fields: {list_metrics['visibleCellCount']} visible cells"
                )
            if list_metrics["rowScrollHeight"] > list_metrics["rowClientHeight"] + 1:
                raise AssertionError(
                    "Claims mobile record clips content: "
                    f"scrollHeight={list_metrics['rowScrollHeight']} "
                    f"clientHeight={list_metrics['rowClientHeight']}"
                )
            if not list_metrics["detailVisible"]:
                raise AssertionError("Claims mobile record clips or hides the detail action")

        results.append(
            {
                "width": width,
                "height": height,
                "kanban": {
                    **kanban_metrics,
                    "horizontalOverflow": kanban_overflow,
                    "screenshot": kanban_shot,
                    "fullPageScreenshot": kanban_full,
                },
                "list": {
                    **list_metrics,
                    "horizontalOverflow": list_overflow,
                    "screenshot": list_shot,
                    "fullPageScreenshot": list_full,
                },
            }
        )

        # Restore canonical default for the next viewport.
        kanban_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Kanban')]")))
        kanban_button.click()
        wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".ops-kanban")))
        time.sleep(0.15)

    severe = [
        entry.get("message", "")
        for entry in driver.get_log("browser")
        if entry.get("level") == "SEVERE" and "favicon.ico" not in entry.get("message", "")
    ]
    if severe:
        raise AssertionError(f"Browser console contained severe errors: {severe[:10]}")
finally:
    try:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    except Exception:
        pass
    driver.quit()

print(json.dumps({"event": "CLAIMS_WORKSPACE_VIEWPORT_PASS", "viewports": results}, ensure_ascii=False))
