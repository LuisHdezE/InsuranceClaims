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
CLAIM_ID = "claim-visual-detail-001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/claim-detail")
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
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", submit)
    driver.execute_script("arguments[0].click();", submit)
    wait.until(lambda d: "/operator/dashboard" in d.current_url)

    claims_link = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, 'a.operator-sidebar-item[href="/operator/claims"]'))
    )
    driver.execute_script("arguments[0].click();", claims_link)
    wait.until(lambda d: "/operator/claims" in d.current_url)

    detail_link = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, f"a[href='/operator/claims/{CLAIM_ID}']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", detail_link)
    driver.execute_script("arguments[0].click();", detail_link)
    wait.until(lambda d: f"/operator/claims/{CLAIM_ID}" in d.current_url)
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-claim-detail-page")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[contains(., 'CLM-2026-1842')]")))
    wait.until(lambda d: "Evaluación" in d.find_element(By.CSS_SELECTOR, ".r3-pipeline-panel").text)
    wait.until(lambda d: "Revisar declaración inicial" in d.find_element(By.CSS_SELECTOR, "#tareas").text)
    wait.until(lambda d: "lateral-derecho.jpg" in d.find_element(By.CSS_SELECTOR, "#evidencia").text)

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-claim-detail-page');
            const hero = document.querySelector('.r3-detail-hero');
            const heroTitle = document.querySelector('.r3-detail-hero h1');
            const anchorNav = document.querySelector('.r3-detail-anchor-nav');
            const grid = document.querySelector('.r3-claim-detail-grid');
            const summaryRow = document.querySelector('.ops-summary-row');
            const panelTitle = document.querySelector('.r3-claim-detail-grid .ops-panel-heading h2');
            const technicalKey = document.querySelector('.r3-pipeline-current code');
            const audit = document.querySelector('.ops-audit-details');
            const refresh = document.querySelector('.ops-detail-actions .ops-icon-button');
            const gridStyle = grid ? getComputedStyle(grid) : null;
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
              heroTitleFont: heroTitle ? parseFloat(getComputedStyle(heroTitle).fontSize) : 0,
              anchorHeight: anchorNav ? Math.round(anchorNav.getBoundingClientRect().height) : 0,
              gridColumns: gridStyle ? gridStyle.gridTemplateColumns : '',
              summaryRowHeight: summaryRow ? Math.round(summaryRow.getBoundingClientRect().height) : 0,
              panelTitleFont: panelTitle ? parseFloat(getComputedStyle(panelTitle).fontSize) : 0,
              technicalKeyDisplay: technicalKey ? getComputedStyle(technicalKey).display : 'missing',
              auditOpen: audit ? audit.hasAttribute('open') : false,
              refreshHeight: refresh ? Math.round(refresh.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"claim-detail-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Claim detail horizontal overflow at {width}x{height}: {overflow}px")

        if metrics["technicalKeyDisplay"] != "none":
            raise AssertionError("Technical operational stage key must not dominate the normal claim-detail UI")
        if metrics["auditOpen"]:
            raise AssertionError("Technical audit must remain collapsed by default")

        if width >= 1200:
            if metrics["heroHeight"] > 90:
                raise AssertionError(f"Claim detail hero wastes vertical space: {metrics['heroHeight']}px")
            if metrics["heroTitleFont"] > 29:
                raise AssertionError(f"Claim detail title is oversized: {metrics['heroTitleFont']}px")
            if metrics["anchorHeight"] > 42:
                raise AssertionError(f"Claim detail anchor nav is too tall: {metrics['anchorHeight']}px")
            if metrics["summaryRowHeight"] > 40:
                raise AssertionError(f"Claim detail summary row is too tall: {metrics['summaryRowHeight']}px")
            if metrics["panelTitleFont"] > 15:
                raise AssertionError(f"Claim detail panel heading is oversized: {metrics['panelTitleFont']}px")
            if len([part for part in metrics["gridColumns"].split(" ") if part.strip()]) < 2:
                raise AssertionError(f"Desktop claim detail lost approved main+side composition: {metrics['gridColumns']}")
        elif width <= 520:
            if metrics["refreshHeight"] < 44:
                raise AssertionError(f"Claim detail mobile refresh target is too short: {metrics['refreshHeight']}px")
            if metrics["heroTitleFont"] > 23:
                raise AssertionError(f"Claim detail mobile title is oversized: {metrics['heroTitleFont']}px")

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

print(json.dumps({"event": "CLAIM_DETAIL_VIEWPORT_PASS", "viewports": results}, ensure_ascii=False))
