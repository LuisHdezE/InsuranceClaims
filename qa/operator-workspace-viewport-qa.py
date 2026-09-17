from __future__ import annotations

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
ARTIFACT_DIR = Path(".qa-artifacts/operator-workspace")
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
    wait.until(EC.visibility_of_element_located((By.ID, "operator-login"))).send_keys("platform.admin@visual-qa.invalid")
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    driver.find_element(By.CSS_SELECTOR, "form.operator-form button[type='submit']").click()

    wait.until(lambda d: "/operator/workspace" in d.current_url)
    wait.until(lambda d: "Tu espacio de trabajo" in d.find_element(By.TAG_NAME, "body").text)
    wait.until(lambda d: "Administrador de plataforma" in d.find_element(By.TAG_NAME, "body").text)

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
        time.sleep(0.3)
        driver.execute_script("window.scrollTo(0, 0)")

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
            };
            """
        )

        horizontal_overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        screenshot_path = ARTIFACT_DIR / f"operator-workspace-{width}x{height}.png"
        driver.save_screenshot(str(screenshot_path))

        result = {
            "width": width,
            "height": height,
            "scrollHeight": metrics["scrollHeight"],
            "innerHeight": metrics["innerHeight"],
            "horizontalOverflow": horizontal_overflow,
            "screenshot": str(screenshot_path),
        }
        results.append(result)

        if horizontal_overflow > TOLERANCE_PX:
            raise AssertionError(
                f"Operator workspace has horizontal overflow at {width}x{height}: "
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

print(json.dumps({"event": "OPERATOR_WORKSPACE_VIEWPORT_PASS", "viewports": results}, ensure_ascii=False))
