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
ARTIFACT_DIR = Path(".qa-artifacts/operator-claims")
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
results: list[dict[str, int | float | str]] = []

try:
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": 1366, "height": 768, "deviceScaleFactor": 1, "mobile": False},
    )
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    wait.until(EC.visibility_of_element_located((By.ID, "operator-login"))).send_keys(
        "claims.supervisor@visual-qa.invalid"
    )
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    submit = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", submit)
    wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    ).click()
    wait.until(lambda d: "/operator/dashboard" in d.current_url)

    # Preserve the in-memory operator session by navigating through the real SPA link.
    claims_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a[href='/operator/claims']"))
    )
    claims_link.click()
    wait.until(lambda d: "/operator/claims" in d.current_url)
    wait.until(lambda d: "Gestión de siniestros" in d.find_element(By.TAG_NAME, "body").text)

    list_button = wait.until(
        lambda d: next(
            (button for button in d.find_elements(By.CSS_SELECTOR, ".ops-view-toggle button") if "Lista" in button.text),
            None,
        )
    )
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", list_button)
    list_button.click()

    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".claims-table tbody tr")))
    wait.until(lambda d: "CLM-2026-1842" in d.find_element(By.TAG_NAME, "body").text)

    for width, height in TARGETS:
        driver.execute_cdp_cmd(
            "Emulation.setDeviceMetricsOverride",
            {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False},
        )
        time.sleep(0.35)
        driver.execute_script("window.scrollTo(0, 0)")

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const table = document.querySelector('.claims-table');
            const firstRow = document.querySelector('.claims-table tbody tr');
            const firstCell = document.querySelector('.claims-table tbody td');
            const cellStyle = firstCell ? getComputedStyle(firstCell) : null;
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              tableWidth: table ? Math.round(table.getBoundingClientRect().width) : 0,
              firstRowHeight: firstRow ? Math.round(firstRow.getBoundingClientRect().height) : 0,
              firstCellFontSize: cellStyle ? parseFloat(cellStyle.fontSize) : 0,
              firstCellPaddingTop: cellStyle ? parseFloat(cellStyle.paddingTop) : 0,
              firstCellPaddingBottom: cellStyle ? parseFloat(cellStyle.paddingBottom) : 0,
            };
            """
        )

        horizontal_overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        screenshot_path = ARTIFACT_DIR / f"operator-claims-{width}x{height}.png"
        driver.save_screenshot(str(screenshot_path))

        full_page_path = ARTIFACT_DIR / f"operator-claims-{width}x{height}-full.png"
        full_capture = driver.execute_cdp_cmd(
            "Page.captureScreenshot",
            {"format": "png", "captureBeyondViewport": True, "fromSurface": True},
        )
        full_page_path.write_bytes(base64.b64decode(full_capture["data"]))

        result = {
            "width": width,
            "height": height,
            "scrollHeight": metrics["scrollHeight"],
            "innerHeight": metrics["innerHeight"],
            "horizontalOverflow": horizontal_overflow,
            "tableWidth": metrics["tableWidth"],
            "firstRowHeight": metrics["firstRowHeight"],
            "firstCellFontSize": metrics["firstCellFontSize"],
            "firstCellPaddingTop": metrics["firstCellPaddingTop"],
            "firstCellPaddingBottom": metrics["firstCellPaddingBottom"],
            "screenshot": str(screenshot_path),
            "fullPageScreenshot": str(full_page_path),
        }
        results.append(result)

        if horizontal_overflow > TOLERANCE_PX:
            raise AssertionError(
                f"Claims workspace has page horizontal overflow at {width}x{height}: "
                f"scrollWidth={metrics['scrollWidth']} innerWidth={metrics['innerWidth']} "
                f"overflow={horizontal_overflow}px"
            )

        if width >= 1024:
            if metrics["firstCellFontSize"] > 12:
                raise AssertionError(
                    f"Claims list body font is too large at {width}x{height}: "
                    f"{metrics['firstCellFontSize']}px"
                )
            if metrics["firstCellPaddingTop"] > 10 or metrics["firstCellPaddingBottom"] > 10:
                raise AssertionError(
                    f"Claims list cell padding is too large at {width}x{height}: "
                    f"top={metrics['firstCellPaddingTop']}px bottom={metrics['firstCellPaddingBottom']}px"
                )
            if metrics["firstRowHeight"] > 76:
                raise AssertionError(
                    f"Claims list row is too tall at {width}x{height}: {metrics['firstRowHeight']}px"
                )

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

print(json.dumps({"event": "OPERATOR_CLAIMS_VIEWPORT_PASS", "viewports": results}, ensure_ascii=False))
