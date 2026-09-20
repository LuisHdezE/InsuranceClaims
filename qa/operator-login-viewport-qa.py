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
results: list[dict[str, object]] = []

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
            const personas = Array.from(document.querySelectorAll('.r3-login-demo-button')).map((button) => {
              const copy = button.querySelector('span');
              const buttonRect = button.getBoundingClientRect();
              const copyRect = copy ? copy.getBoundingClientRect() : null;
              const buttonStyle = getComputedStyle(button);
              return {
                key: button.dataset.demoPersona || '',
                flexDirection: buttonStyle.flexDirection,
                copyClientWidth: copy ? copy.clientWidth : 0,
                copyScrollWidth: copy ? copy.scrollWidth : 0,
                copyClientHeight: copy ? copy.clientHeight : 0,
                copyScrollHeight: copy ? copy.scrollHeight : 0,
                copyRight: copyRect ? copyRect.right : 0,
                copyBottom: copyRect ? copyRect.bottom : 0,
                buttonRight: buttonRect.right,
                buttonBottom: buttonRect.bottom,
              };
            });
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              clientWidth: root.clientWidth,
              clientHeight: root.clientHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              personas,
            };
            """
        )

        screenshot_path = ARTIFACT_DIR / f"operator-login-{width}x{height}.png"
        driver.save_screenshot(str(screenshot_path))

        vertical_overflow = metrics["scrollHeight"] - metrics["innerHeight"]
        horizontal_overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        personas = metrics["personas"]
        result = {
            "width": width,
            "height": height,
            "scrollHeight": metrics["scrollHeight"],
            "innerHeight": metrics["innerHeight"],
            "verticalOverflow": vertical_overflow,
            "horizontalOverflow": horizontal_overflow,
            "personas": personas,
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

        if len(personas) != 3:
            raise AssertionError(
                f"Operator login expected 3 demo persona buttons at {width}x{height}, got {len(personas)}"
            )

        for persona in personas:
            if persona["flexDirection"] != "column":
                raise AssertionError(
                    f"Demo persona {persona['key']} copy is not vertically stacked at {width}x{height}: "
                    f"flexDirection={persona['flexDirection']}"
                )
            if persona["copyScrollWidth"] - persona["copyClientWidth"] > TOLERANCE_PX:
                raise AssertionError(
                    f"Demo persona {persona['key']} copy clips horizontally at {width}x{height}: "
                    f"scrollWidth={persona['copyScrollWidth']} clientWidth={persona['copyClientWidth']}"
                )
            if persona["copyScrollHeight"] - persona["copyClientHeight"] > TOLERANCE_PX:
                raise AssertionError(
                    f"Demo persona {persona['key']} copy clips vertically at {width}x{height}: "
                    f"scrollHeight={persona['copyScrollHeight']} clientHeight={persona['copyClientHeight']}"
                )
            if persona["copyRight"] - persona["buttonRight"] > TOLERANCE_PX:
                raise AssertionError(
                    f"Demo persona {persona['key']} copy escapes button horizontally at {width}x{height}"
                )
            if persona["copyBottom"] - persona["buttonBottom"] > TOLERANCE_PX:
                raise AssertionError(
                    f"Demo persona {persona['key']} copy escapes button vertically at {width}x{height}"
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
