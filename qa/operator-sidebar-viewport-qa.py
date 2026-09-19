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

PERSONAS = {
    "operations": {
        "label": "Operations",
        "landing": "/operator/dashboard",
        "links": {
            "/operator/workspace",
            "/operator/dashboard",
            "/operator/claims",
            "/operator/tasks",
            "/operator/customers",
            "/operator/policies",
            "/operator/renewals",
            "/operator/collections",
        },
    },
    "supervision": {
        "label": "Supervision",
        "landing": "/operator/dashboard",
        "links": {
            "/operator/workspace",
            "/operator/dashboard",
            "/operator/claims",
            "/operator/tasks",
            "/operator/analytics",
            "/operator/customers",
            "/operator/policies",
            "/operator/renewals",
            "/operator/collections",
        },
    },
    "administration": {
        "label": "Administration",
        "landing": "/operator/workspace",
        "links": {
            "/operator/workspace",
            "/operator/analytics",
            "/operator/admin/pipelines",
            "/operator/admin/communication-templates",
            "/operator/admin/custom-fields",
        },
    },
}

PENDING_PATHS = {
    "/operator/admin/guidance",
    "/operator/admin/automations",
    "/operator/admin/imports",
    "/operator/admin/recovery",
}

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--force-device-scale-factor=1")
options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})

browser_bin = os.environ.get("BROWSER_BIN")
if browser_bin:
    options.binary_location = browser_bin

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 75)
results: list[dict[str, object]] = []


def set_viewport(width: int, height: int) -> None:
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False},
    )
    time.sleep(0.2)
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


def clear_session() -> None:
    driver.get(f"{WEB_BASE_URL}/")
    driver.execute_script("window.localStorage.clear(); window.sessionStorage.clear();")
    driver.delete_all_cookies()


def open_persona(persona_key: str, expected_landing: str) -> None:
    clear_session()
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
    button = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, f'button[data-demo-persona="{persona_key}"]')))
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
    wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, f'button[data-demo-persona="{persona_key}"]')))
    driver.execute_script("arguments[0].click();", button)
    wait.until(lambda d: d.current_url.rstrip("/").endswith(expected_landing))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".operator-sidebar-component")))


def visible_sidebar_paths() -> set[str]:
    paths: set[str] = set()
    for link in driver.find_elements(By.CSS_SELECTOR, ".operator-sidebar-nav a.operator-sidebar-item"):
        href = link.get_attribute("href")
        if href.startswith(WEB_BASE_URL):
            paths.add(href.removeprefix(WEB_BASE_URL))
    return paths


def assert_active(path: str) -> None:
    active = driver.find_elements(By.CSS_SELECTOR, ".operator-sidebar-item.is-active")
    if len(active) != 1:
        raise AssertionError(f"Expected exactly one active Sidebar item at {path}, got {len(active)}")
    href = active[0].get_attribute("href") or ""
    if not href.endswith(path):
        raise AssertionError(f"Active Sidebar item mismatch at {path}: {href}")


def collect_forbidden_api_responses() -> list[str]:
    forbidden: list[str] = []
    for entry in driver.get_log("performance"):
        try:
            message = json.loads(entry["message"])["message"]
            if message.get("method") != "Network.responseReceived":
                continue
            response = message["params"]["response"]
            url = response.get("url", "")
            if response.get("status") == 403 and "/api/v1/" in url:
                forbidden.append(url)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
    return forbidden


def viewport_metrics() -> dict[str, object]:
    return driver.execute_script(
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


try:
    for persona_key, contract in PERSONAS.items():
        persona_label = contract["label"]
        expected_paths = contract["links"]
        for width, height in TARGETS:
            set_viewport(width, height)
            open_persona(persona_key, contract["landing"])
            actual_paths = visible_sidebar_paths()
            if actual_paths != expected_paths:
                raise AssertionError(
                    f"{persona_label} Sidebar mismatch at {width}x{height}: expected={sorted(expected_paths)} actual={sorted(actual_paths)}"
                )
            if actual_paths & PENDING_PATHS:
                raise AssertionError(f"{persona_label} exposed pending demo modules: {sorted(actual_paths & PENDING_PATHS)}")

            for path in sorted(expected_paths):
                link = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, f'a.operator-sidebar-item[href="{path}"]')))
                driver.execute_script("arguments[0].click();", link)
                wait.until(lambda d, target=path: d.current_url.rstrip("/").endswith(target))
                wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".operator-sidebar-component")))
                assert_active(path)
                time.sleep(0.15)

            forbidden = collect_forbidden_api_responses()
            if forbidden:
                raise AssertionError(f"{persona_label} produced unexpected API 403 responses: {forbidden[:10]}")

            metrics = viewport_metrics()
            overflow = int(metrics["scrollWidth"]) - int(metrics["innerWidth"])
            shot, full = capture(f"{persona_key}-{width}x{height}")
            if overflow > TOLERANCE_PX:
                raise AssertionError(f"{persona_label} shell horizontal overflow at {width}x{height}: {overflow}px")

            if width >= 1024:
                if int(metrics["sidebarWidth"]) > 240:
                    raise AssertionError(f"{persona_label} Sidebar is too wide: {metrics['sidebarWidth']}px")
                if int(metrics["itemHeight"]) > 38:
                    raise AssertionError(f"{persona_label} Sidebar item is too tall: {metrics['itemHeight']}px")
            else:
                if int(metrics["sidebarHeight"]) > 84:
                    raise AssertionError(f"{persona_label} mobile Sidebar/header is too tall: {metrics['sidebarHeight']}px")
                if int(metrics["itemHeight"]) < 44:
                    raise AssertionError(f"{persona_label} mobile Sidebar touch target is too short: {metrics['itemHeight']}px")
                if int(metrics["navScrollWidth"]) < int(metrics["navClientWidth"]):
                    raise AssertionError(f"{persona_label} mobile Sidebar navigation geometry is invalid")
                if metrics["labelDisplay"] != "none":
                    raise AssertionError(f"{persona_label} mobile Sidebar labels should collapse to icons")

            results.append({
                "persona": persona_label,
                "width": width,
                "height": height,
                "paths": sorted(actual_paths),
                **metrics,
                "horizontalOverflow": overflow,
                "screenshot": shot,
                "fullPageScreenshot": full,
            })

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

print(json.dumps({"event": "DEMO_PERSONA_SIDEBAR_GATE_PASS", "viewports": results}, ensure_ascii=False))
