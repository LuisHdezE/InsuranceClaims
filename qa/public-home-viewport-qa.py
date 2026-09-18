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
ARTIFACT_DIR = Path(".qa-artifacts/public-home")
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


try:
    driver.get(f"{WEB_BASE_URL}/")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    wait.until(EC.visibility_of_element_located((By.ID, "landing-title")))
    wait.until(lambda d: "Reportar un siniestro" in d.find_element(By.TAG_NAME, "body").text)

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.2)

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const header = document.querySelector('.refreshed-header-row');
            const hero = document.querySelector('.landing-hero');
            const h1 = document.querySelector('.landing-hero h1');
            const lead = document.querySelector('.landing-hero-copy > p');
            const primary = document.querySelector('.landing-btn-primary');
            const journeys = document.querySelector('.landing-journeys');
            const journeyCard = document.querySelector('.landing-journey-card');
            const process = document.querySelector('.landing-process');
            const benefits = document.querySelector('.landing-benefits');
            const footer = document.querySelector('.refreshed-footer-main');

            function px(node, prop) {
              return node ? parseFloat(getComputedStyle(node)[prop]) : 0;
            }

            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
              heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
              heroTitleFont: h1 ? px(h1, 'fontSize') : 0,
              leadFont: lead ? px(lead, 'fontSize') : 0,
              primaryHeight: primary ? Math.round(primary.getBoundingClientRect().height) : 0,
              journeyCardHeight: journeyCard ? Math.round(journeyCard.getBoundingClientRect().height) : 0,
              journeysPaddingTop: journeys ? px(journeys, 'paddingTop') : 0,
              processPaddingTop: process ? px(process, 'paddingTop') : 0,
              benefitsPaddingTop: benefits ? px(benefits, 'paddingTop') : 0,
              footerHeight: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"public-home-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Public home horizontal overflow at {width}x{height}: {overflow}px")

        if width >= 1024:
            if metrics["headerHeight"] > 70:
                raise AssertionError(f"Public header is too tall: {metrics['headerHeight']}px")
            if metrics["heroHeight"] > 365:
                raise AssertionError(f"Public hero wastes vertical space: {metrics['heroHeight']}px")
            if metrics["heroTitleFont"] > 46:
                raise AssertionError(f"Public hero title is oversized: {metrics['heroTitleFont']}px")
            if metrics["leadFont"] > 15:
                raise AssertionError(f"Public hero lead is oversized: {metrics['leadFont']}px")
            if metrics["primaryHeight"] > 46:
                raise AssertionError(f"Public primary CTA is too tall: {metrics['primaryHeight']}px")
            if metrics["journeyCardHeight"] > 100:
                raise AssertionError(f"Public journey card wastes vertical space: {metrics['journeyCardHeight']}px")
            if metrics["journeysPaddingTop"] > 24:
                raise AssertionError(f"Public journeys top padding is excessive: {metrics['journeysPaddingTop']}px")
            if metrics["processPaddingTop"] > 22:
                raise AssertionError(f"Public process top padding is excessive: {metrics['processPaddingTop']}px")
            if metrics["benefitsPaddingTop"] > 22:
                raise AssertionError(f"Public benefits top padding is excessive: {metrics['benefitsPaddingTop']}px")
        elif width <= 640:
            if metrics["primaryHeight"] < 44:
                raise AssertionError(f"Public mobile CTA touch target is too short: {metrics['primaryHeight']}px")
            if metrics["heroTitleFont"] > 40:
                raise AssertionError(f"Public mobile hero title is oversized: {metrics['heroTitleFont']}px")

        results.append(
            {
                "width": width,
                "height": height,
                **metrics,
                "horizontalOverflow": overflow,
                "screenshot": shot,
                "fullPageScreenshot": full,
            }
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

print(json.dumps({"event": "PUBLIC_HOME_VIEWPORT_PASS", "viewports": results}, ensure_ascii=False))
