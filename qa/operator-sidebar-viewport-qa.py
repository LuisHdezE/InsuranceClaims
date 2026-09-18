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
TARGETS = ((1366, 768), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/operator-sidebar")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

EXPECTED_DEMO_LABELS = {
    "Espacio de trabajo",
    "Tablero",
    "Siniestros",
    "Tareas",
    "Analítica",
    "Clientes",
    "Pólizas",
    "Renovaciones",
    "Cobranzas",
    "Pipelines",
    "Plantillas",
    "Campos",
    "Orientación",
    "Automatizaciones",
    "Importaciones",
    "Recuperación",
}

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
    submit.click()

    wait.until(lambda d: "/operator/claims" in d.current_url)
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".operator-sidebar-component")))
    wait.until(lambda d: "Recuperación" in d.find_element(By.CSS_SELECTOR, ".operator-sidebar-component").text)

    labels = {
        node.text.strip()
        for node in driver.find_elements(By.CSS_SELECTOR, ".operator-sidebar-item-label")
        if node.text.strip()
    }
    if labels != EXPECTED_DEMO_LABELS:
        raise AssertionError(f"Unexpected demo sidebar catalog: {sorted(labels)}")

    pending = driver.find_elements(By.CSS_SELECTOR, ".operator-sidebar-item.is-pending[aria-disabled='true']")
    if len(pending) != 15:
        raise AssertionError(f"Expected 15 disabled demo destinations, got {len(pending)}")

    active = driver.find_elements(By.CSS_SELECTOR, ".operator-sidebar-item.is-active")
    if len(active) != 1 or "Siniestros" not in active[0].text:
        raise AssertionError("Claims must be the only active demo navigation destination")

    nav_links = driver.find_elements(By.CSS_SELECTOR, ".operator-sidebar-nav a.operator-sidebar-item")
    if len(nav_links) != 1:
        raise AssertionError(f"Demo sidebar gained unexpected clickable destinations: {len(nav_links)}")

    for width, height in TARGETS:
        set_viewport(width, height)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const sidebar = document.querySelector('.operator-sidebar-component');
            const nav = document.querySelector('.operator-sidebar-nav');
            const item = document.querySelector('.operator-sidebar-item');
            const label = document.querySelector('.operator-sidebar-item-label');
            return {
              innerWidth: window.innerWidth,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
              sidebarHeight: sidebar ? Math.round(sidebar.getBoundingClientRect().height) : 0,
              navScrollHeight: nav ? nav.scrollHeight : 0,
              navClientHeight: nav ? nav.clientHeight : 0,
              navScrollWidth: nav ? nav.scrollWidth : 0,
              navClientWidth: nav ? nav.clientWidth : 0,
              itemHeight: item ? Math.round(item.getBoundingClientRect().height) : 0,
              labelDisplay: label ? getComputedStyle(label).display : '',
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"operator-sidebar-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Operator shell horizontal overflow at {width}x{height}: {overflow}px")

        if width >= 1024:
            if metrics["sidebarWidth"] > 240:
                raise AssertionError(f"Sidebar is too wide: {metrics['sidebarWidth']}px")
            if metrics["itemHeight"] > 38:
                raise AssertionError(f"Sidebar item is too tall: {metrics['itemHeight']}px")
            if metrics["navScrollHeight"] > metrics["navClientHeight"] + 2:
                raise AssertionError("Complete demo sidebar catalog should fit without vertical clipping at desktop QA height")
        else:
            if metrics["sidebarHeight"] > 84:
                raise AssertionError(f"Mobile sidebar/header is too tall: {metrics['sidebarHeight']}px")
            if metrics["itemHeight"] < 44:
                raise AssertionError(f"Mobile sidebar touch target is too short: {metrics['itemHeight']}px")
            if metrics["navScrollWidth"] <= metrics["navClientWidth"]:
                raise AssertionError("Mobile sidebar should preserve horizontally scrollable navigation")
            if metrics["labelDisplay"] != "none":
                raise AssertionError("Mobile sidebar labels should collapse to icons to preserve density")

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

print(json.dumps({"event": "OPERATOR_SIDEBAR_VIEWPORT_PASS", "viewports": results}, ensure_ascii=False))
