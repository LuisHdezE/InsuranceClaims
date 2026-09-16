from __future__ import annotations

import json
import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

WEB_BASE_URL = os.environ.get("QA_WEB_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
TARGETS = ((1366, 768), (1280, 720), (1366, 600), (1280, 600))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/operator-login")
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
results: list[dict[str, int | str]] = []

try:
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    wait.until(lambda d: "Acceso de operadores" in d.find_element(By.TAG_NAME, "body").text)

    for width, height in TARGETS:
        driver.execute_cdp_cmd(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": False,
            },
        )
        time.sleep(0.25)
        driver.execute_script("window.scrollTo(0, 0)")

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              clientWidth: root.clientWidth,
              clientHeight: root.clientHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
            };
            """
        )

        screenshot_path = ARTIFACT_DIR / f"operator-login-{width}x{height}.png"
        driver.save_screenshot(str(screenshot_path))

        vertical_overflow = metrics["scrollHeight"] - metrics["innerHeight"]
        horizontal_overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        result = {
            "width": width,
            "height": height,
            "scrollHeight": metrics["scrollHeight"],
            "innerHeight": metrics["innerHeight"],
            "verticalOverflow": vertical_overflow,
            "horizontalOverflow": horizontal_overflow,
            "screenshot": str(screenshot_path),
        }
        results.append(result)

        if vertical_overflow > TOLERANCE_PX:
            raise AssertionError(
                f"Operator login requires vertical scrolling at {width}x{height}: "
                f"scrollHeight={metrics['scrollHeight']} innerHeight={metrics['innerHeight']} "
                f"overflow={vertical_overflow}px"
            )
        if horizontal_overflow > TOLERANCE_PX:
            raise AssertionError(
                f"Operator login has horizontal overflow at {width}x{height}: "
                f"scrollWidth={metrics['scrollWidth']} innerWidth={metrics['innerWidth']} "
                f"overflow={horizontal_overflow}px"
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

print(json.dumps({"event": "OPERATOR_LOGIN_VIEWPORT_PASS", "viewports": results}, ensure_ascii=False))
