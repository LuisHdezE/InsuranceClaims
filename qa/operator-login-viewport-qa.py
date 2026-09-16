from __future__ import annotations

import json
import os
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

WEB_BASE_URL = os.environ.get("QA_WEB_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
TARGETS = ((1366, 768), (1280, 720))
TOLERANCE_PX = 2

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
results: list[dict[str, float | int]] = []

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
            const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
            const context = rect('.r3-login-context');
            const formSide = rect('.r3-login-form-side');
            const card = rect('.r3-login-card');
            const demo = rect('.r3-login-demo-panel');
            const loginInput = rect('#operator-login');
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              clientWidth: root.clientWidth,
              clientHeight: root.clientHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              contextWidth: context?.width ?? 0,
              formSideWidth: formSide?.width ?? 0,
              cardWidth: card?.width ?? 0,
              demoPanelWidth: demo?.width ?? 0,
              loginInputWidth: loginInput?.width ?? 0,
            };
            """
        )

        vertical_overflow = metrics["scrollHeight"] - metrics["innerHeight"]
        horizontal_overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        context_ratio = metrics["contextWidth"] / metrics["innerWidth"]
        result = {
            "width": width,
            "height": height,
            "scrollHeight": metrics["scrollHeight"],
            "innerHeight": metrics["innerHeight"],
            "verticalOverflow": vertical_overflow,
            "horizontalOverflow": horizontal_overflow,
            "contextRatio": round(context_ratio, 3),
            "cardWidth": round(metrics["cardWidth"], 1),
            "demoPanelWidth": round(metrics["demoPanelWidth"], 1),
            "loginInputWidth": round(metrics["loginInputWidth"], 1),
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
        if not 0.33 <= context_ratio <= 0.44:
            raise AssertionError(
                f"Operator login desktop split is unbalanced at {width}x{height}: "
                f"left context ratio={context_ratio:.3f}"
            )
        if metrics["cardWidth"] < 700:
            raise AssertionError(
                f"Operator login card is too narrow at {width}x{height}: "
                f"cardWidth={metrics['cardWidth']:.1f}px"
            )
        if metrics["demoPanelWidth"] < 620:
            raise AssertionError(
                f"Public demo content is too compressed at {width}x{height}: "
                f"demoPanelWidth={metrics['demoPanelWidth']:.1f}px"
            )
        if metrics["loginInputWidth"] < 340:
            raise AssertionError(
                f"Credential fields are too compressed at {width}x{height}: "
                f"loginInputWidth={metrics['loginInputWidth']:.1f}px"
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
