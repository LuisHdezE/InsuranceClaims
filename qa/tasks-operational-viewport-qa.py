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
TASK_ID = "task-visual-001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/tasks-operational")
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
workspace_results: list[dict[str, object]] = []
detail_results: list[dict[str, object]] = []


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


def track_count(value: str) -> int:
    return len([part for part in value.split(" ") if part.strip()])


def severe_console_entries() -> list[str]:
    return [
        entry.get("message", "")
        for entry in driver.get_log("browser")
        if entry.get("level") == "SEVERE" and "favicon.ico" not in entry.get("message", "")
    ]


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
    submit.click()
    wait.until(lambda d: "/operator/" in d.current_url and "/login" not in d.current_url)

    tasks_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/tasks']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", tasks_link)
    tasks_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/tasks"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-task-workspace-page")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[contains(., 'Tareas operativas')]")))
    wait.until(lambda d: "Revisar declaración inicial" in d.find_element(By.CSS_SELECTOR, ".r3-task-queue-list").text)
    wait.until(lambda d: "CLM-2026-1842" in d.find_element(By.CSS_SELECTOR, ".r3-task-inline-detail").text)
    wait.until(lambda d: "no modifica automáticamente" in d.find_element(By.CSS_SELECTOR, ".r3-task-domain-note").text)
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".ops-demo-readonly-banner")))

    # Ignore any transient console noise produced by the login landing route before Tasks is opened.
    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-task-workspace-page');
            const title = document.querySelector('.r3-task-workspace-page .ops-page-heading h1');
            const tabs = document.querySelector('.r3-task-scope-tabs');
            const firstTab = document.querySelector('.r3-task-scope-tabs button');
            const filters = document.querySelector('.r3-task-filter-strip');
            const firstFilter = document.querySelector('.r3-task-filter-strip input');
            const grid = document.querySelector('.r3-task-master-detail');
            const queueItem = document.querySelector('.r3-task-queue-item');
            const detailTitle = document.querySelector('.r3-task-inline-header h2');
            const refresh = document.querySelector('.ops-page-heading .ops-refresh-button');
            const primaryAction = document.querySelector('.r3-task-inline-actions .ops-primary-action');
            const assignAction = [...document.querySelectorAll('.r3-task-inline-actions button')]
              .find((element) => element.textContent?.includes('Asignarme'));
            const gridStyle = grid ? getComputedStyle(grid) : null;
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              tabsHeight: tabs ? Math.round(tabs.getBoundingClientRect().height) : 0,
              firstTabHeight: firstTab ? Math.round(firstTab.getBoundingClientRect().height) : 0,
              filtersHeight: filters ? Math.round(filters.getBoundingClientRect().height) : 0,
              firstFilterHeight: firstFilter ? Math.round(firstFilter.getBoundingClientRect().height) : 0,
              gridColumns: gridStyle ? gridStyle.gridTemplateColumns : '',
              queueItemHeight: queueItem ? Math.round(queueItem.getBoundingClientRect().height) : 0,
              detailTitleFont: detailTitle ? parseFloat(getComputedStyle(detailTitle).fontSize) : 0,
              refreshHeight: refresh ? Math.round(refresh.getBoundingClientRect().height) : 0,
              primaryActionHeight: primaryAction ? Math.round(primaryAction.getBoundingClientRect().height) : 0,
              assignActionPresent: Boolean(assignAction),
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"tasks-workspace-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Tasks workspace horizontal overflow at {width}x{height}: {overflow}px")
        if metrics["primaryActionHeight"] != 0 or metrics["assignActionPresent"]:
            raise AssertionError("Public demo Tasks workspace exposed a mutating action")

        columns = track_count(str(metrics["gridColumns"]))
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Tasks workspace title is oversized: {metrics['titleFont']}px")
            if metrics["tabsHeight"] > 42:
                raise AssertionError(f"Tasks scope navigation is too tall: {metrics['tabsHeight']}px")
            if metrics["filtersHeight"] > 70:
                raise AssertionError(f"Tasks filters waste vertical space: {metrics['filtersHeight']}px")
            if metrics["queueItemHeight"] > 82:
                raise AssertionError(f"Tasks queue lost approved density: {metrics['queueItemHeight']}px")
            if metrics["detailTitleFont"] > 24:
                raise AssertionError(f"Inline task detail title is oversized: {metrics['detailTitleFont']}px")
            if columns < 2:
                raise AssertionError(f"Desktop tasks workspace lost master-detail composition: {metrics['gridColumns']}")
        elif width <= 1100 and columns != 1:
            raise AssertionError(f"Narrow tasks workspace must stack into one column: {metrics['gridColumns']}")

        if width <= 520:
            for name, value in (
                ("refresh", metrics["refreshHeight"]),
                ("scope tab", metrics["firstTabHeight"]),
                ("filter", metrics["firstFilterHeight"]),
            ):
                if value < 44:
                    raise AssertionError(f"Tasks mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Tasks mobile title is oversized: {metrics['titleFont']}px")

        workspace_results.append(
            {
                "width": width,
                "height": height,
                **metrics,
                "horizontalOverflow": overflow,
                "screenshot": shot,
                "fullPageScreenshot": full,
            }
        )

    set_viewport(1366, 768)
    detail_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f"a[href='/operator/tasks/{TASK_ID}']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", detail_link)
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/tasks/{TASK_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-task-detail-page")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[contains(., 'Revisar declaración inicial')]")))
    wait.until(lambda d: "CLM-2026-1842" in d.find_element(By.CSS_SELECTOR, ".r3-task-context-card").text)
    wait.until(lambda d: "solo lectura" in d.find_element(By.CSS_SELECTOR, ".r3-task-decision-card").text.lower())

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)

        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-task-detail-page');
            const hero = document.querySelector('.r3-task-detail-hero');
            const heroTitle = document.querySelector('.r3-task-detail-hero h1');
            const grid = document.querySelector('.r3-task-detail-grid');
            const gridStyle = grid ? getComputedStyle(grid) : null;
            const firstEditControl = document.querySelector('.r3-task-edit-grid select');
            const claimAction = document.querySelector('.r3-task-context-card .r3-full-action');
            const completeAction = document.querySelector('.r3-task-decision-grid .ops-primary-action');
            const cancelAction = document.querySelector('.r3-task-decision-grid .r3-danger-action');
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
              heroTitleFont: heroTitle ? parseFloat(getComputedStyle(heroTitle).fontSize) : 0,
              gridColumns: gridStyle ? gridStyle.gridTemplateColumns : '',
              firstEditControlHeight: firstEditControl ? Math.round(firstEditControl.getBoundingClientRect().height) : 0,
              claimActionHeight: claimAction ? Math.round(claimAction.getBoundingClientRect().height) : 0,
              completeActionHeight: completeAction ? Math.round(completeAction.getBoundingClientRect().height) : 0,
              cancelActionPresent: Boolean(cancelAction),
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"task-detail-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Task detail horizontal overflow at {width}x{height}: {overflow}px")
        if metrics["firstEditControlHeight"] != 0 or metrics["completeActionHeight"] != 0 or metrics["cancelActionPresent"]:
            raise AssertionError("Public demo Task detail exposed edit/complete/cancel controls")

        columns = track_count(str(metrics["gridColumns"]))
        if width >= 1200:
            if metrics["heroHeight"] > 100:
                raise AssertionError(f"Task detail hero wastes vertical space: {metrics['heroHeight']}px")
            if metrics["heroTitleFont"] > 29:
                raise AssertionError(f"Task detail title is oversized: {metrics['heroTitleFont']}px")
            if columns < 2:
                raise AssertionError(f"Desktop task detail lost approved two-column context: {metrics['gridColumns']}")
        elif width <= 1100 and columns != 1:
            raise AssertionError(f"Narrow task detail must stack into one column: {metrics['gridColumns']}")

        if width <= 520:
            if metrics["claimActionHeight"] < 44:
                raise AssertionError(f"Task detail mobile claim action target is too short: {metrics['claimActionHeight']}px")
            if metrics["heroTitleFont"] > 23:
                raise AssertionError(f"Task detail mobile title is oversized: {metrics['heroTitleFont']}px")

        detail_results.append(
            {
                "width": width,
                "height": height,
                **metrics,
                "horizontalOverflow": overflow,
                "screenshot": shot,
                "fullPageScreenshot": full,
            }
        )

    severe = severe_console_entries()
    if severe:
        raise AssertionError(f"Browser console contained severe errors: {severe[:10]}")
finally:
    try:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    except Exception:
        pass
    driver.quit()

print(
    json.dumps(
        {
            "event": "TASKS_OPERATIONAL_READ_ONLY_VIEWPORT_PASS",
            "workspaceViewports": workspace_results,
            "detailViewports": detail_results,
        },
        ensure_ascii=False,
    )
)
