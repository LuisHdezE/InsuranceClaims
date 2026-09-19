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
COLLECTION_ID = "collection-visual-001"
TARGETS = ((1366, 768), (1280, 720), (1024, 768), (390, 844))
TOLERANCE_PX = 2
ARTIFACT_DIR = Path(".qa-artifacts/collections-r3")
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
directory_results: list[dict[str, object]] = []
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

    collections_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "a.operator-sidebar-item[href='/operator/collections']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", collections_link)
    collections_link.click()
    wait.until(lambda d: d.current_url.endswith("/operator/collections"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-collections-directory")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='Cobranzas']")))
    wait.until(lambda d: "María Rodríguez" in d.find_element(By.CSS_SELECTOR, ".r3-case-table").text)
    wait.until(lambda d: "POL-2026-014" in d.find_element(By.CSS_SELECTOR, ".r3-case-table").text)
    wait.until(lambda d: "SERVER_STATE_ALPHA" in d.find_element(By.CSS_SELECTOR, ".r3-case-table").text)
    wait.until(lambda d: "Contactar cuenta" in d.find_element(By.CSS_SELECTOR, ".r3-case-table").text)
    driver.get_log("browser")

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-collections-directory');
            const title = document.querySelector('.r3-collections-directory .r3-case-page-heading h1');
            const summary = document.querySelector('.r3-collections-directory .r3-case-heading-summary');
            const refresh = document.querySelector('.r3-collections-directory .ops-refresh-button');
            const tableWrap = document.querySelector('.r3-collections-directory .r3-case-table-wrap');
            const table = document.querySelector('.r3-collections-directory .r3-case-table');
            const thead = document.querySelector('.r3-collections-directory .r3-case-table thead');
            const row = document.querySelector('.r3-collections-directory .r3-case-table tbody tr');
            const action = document.querySelector('.r3-collections-directory .r3-case-row-action');
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              summaryHeight: summary ? Math.round(summary.getBoundingClientRect().height) : 0,
              refreshHeight: refresh ? Math.round(refresh.getBoundingClientRect().height) : 0,
              tableDisplay: table ? getComputedStyle(table).display : '',
              tableMinWidth: table ? getComputedStyle(table).minWidth : '',
              theadDisplay: thead ? getComputedStyle(thead).display : '',
              rowDisplay: row ? getComputedStyle(row).display : '',
              rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
              actionHeight: action ? Math.round(action.getBoundingClientRect().height) : 0,
              tableScrollWidth: tableWrap ? tableWrap.scrollWidth : 0,
              tableClientWidth: tableWrap ? tableWrap.clientWidth : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        table_overflow = metrics["tableScrollWidth"] - metrics["tableClientWidth"]
        shot, full = capture(f"collections-directory-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Collections directory horizontal overflow at {width}x{height}: {overflow}px")
        if table_overflow > TOLERANCE_PX:
            raise AssertionError(f"Collections directory internal table overflow at {width}x{height}: {table_overflow}px")
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Collections directory title is oversized: {metrics['titleFont']}px")
            if metrics["rowHeight"] > 72:
                raise AssertionError(f"Collections directory row lost approved density: {metrics['rowHeight']}px")
            if metrics["tableDisplay"] != "table":
                raise AssertionError(f"Desktop Collections directory must remain a table: {metrics['tableDisplay']}")
        if width <= 1100:
            if metrics["theadDisplay"] != "none":
                raise AssertionError("Narrow Collections directory must hide the table header and render cards")
            if metrics["rowDisplay"] != "grid":
                raise AssertionError(f"Narrow collection rows must render as cards: {metrics['rowDisplay']}")
        if width <= 620:
            for name, value in (("refresh", metrics["refreshHeight"]), ("case action", metrics["actionHeight"])):
                if value < 44:
                    raise AssertionError(f"Collections mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Collections mobile title is oversized: {metrics['titleFont']}px")

        directory_results.append(
            {
                "width": width,
                "height": height,
                **metrics,
                "horizontalOverflow": overflow,
                "tableOverflow": table_overflow,
                "screenshot": shot,
                "fullPageScreenshot": full,
            }
        )

    set_viewport(1366, 768)
    detail_link = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f"a[href='/operator/collections/{COLLECTION_ID}']"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", detail_link)
    detail_link.click()
    wait.until(lambda d: d.current_url.endswith(f"/operator/collections/{COLLECTION_ID}"))
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-collection-detail")))
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h1[normalize-space()='María Rodríguez']")))
    wait.until(lambda d: "operaciones de cobranzas r3" in d.find_element(By.CSS_SELECTOR, ".r3-case-hero").text.lower())
    wait.until(lambda d: "ciclo de vida" in d.find_element(By.CSS_SELECTOR, ".r3-case-lifecycle-card").text.lower())
    wait.until(lambda d: "server_state_alpha" in d.find_element(By.CSS_SELECTOR, ".r3-payment-card").text.lower())
    wait.until(lambda d: "contactar cuenta" in d.find_element(By.CSS_SELECTOR, ".r3-case-pipeline-card").text.lower())
    wait.until(lambda d: "follow_up" in d.find_element(By.CSS_SELECTOR, ".r3-case-pipeline-card").text.lower())
    wait.until(lambda d: "control de concurrencia activo" in d.find_element(By.CSS_SELECTOR, ".r3-case-contract-note").text.lower())

    editable_payment_controls = driver.find_elements(
        By.CSS_SELECTOR,
        ".r3-payment-card input, .r3-payment-card select, .r3-payment-card textarea, .r3-payment-card button",
    )
    if editable_payment_controls:
        raise AssertionError("Collections payment state must remain read-only while the allowed catalog is unpublished")

    for width, height in TARGETS:
        set_viewport(width, height)
        time.sleep(0.15)
        metrics = driver.execute_script(
            """
            const root = document.documentElement;
            const body = document.body;
            const page = document.querySelector('.r3-collection-detail');
            const title = document.querySelector('.r3-collection-detail .r3-case-hero h1');
            const hero = document.querySelector('.r3-collection-detail .r3-case-hero');
            const detailGrid = document.querySelector('.r3-collection-detail .r3-case-detail-grid');
            const paymentGrid = document.querySelector('.r3-collection-detail .r3-payment-current');
            const pipelineGrid = document.querySelector('.r3-collection-detail .r3-case-pipeline-layout');
            const customerAction = document.querySelector('.r3-collection-detail .r3-case-context-grid > div:first-child a');
            const policyAction = document.querySelector('.r3-collection-detail .r3-case-context-grid > div:nth-child(2) a');
            const lifecycleAction = document.querySelector('.r3-collection-detail .r3-case-decision');
            const stageAction = document.querySelector('.r3-collection-detail .r3-case-stage-actions button');
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
              pageWidth: page ? Math.round(page.getBoundingClientRect().width) : 0,
              titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
              heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
              detailGridColumns: detailGrid ? getComputedStyle(detailGrid).gridTemplateColumns : '',
              paymentGridColumns: paymentGrid ? getComputedStyle(paymentGrid).gridTemplateColumns : '',
              pipelineGridColumns: pipelineGrid ? getComputedStyle(pipelineGrid).gridTemplateColumns : '',
              customerActionHeight: customerAction ? Math.round(customerAction.getBoundingClientRect().height) : 0,
              policyActionHeight: policyAction ? Math.round(policyAction.getBoundingClientRect().height) : 0,
              lifecycleActionHeight: lifecycleAction ? Math.round(lifecycleAction.getBoundingClientRect().height) : 0,
              stageActionHeight: stageAction ? Math.round(stageAction.getBoundingClientRect().height) : 0,
            };
            """
        )
        overflow = metrics["scrollWidth"] - metrics["innerWidth"]
        shot, full = capture(f"collection-detail-{width}x{height}")

        if overflow > TOLERANCE_PX:
            raise AssertionError(f"Collection detail horizontal overflow at {width}x{height}: {overflow}px")
        detail_columns = track_count(str(metrics["detailGridColumns"]))
        payment_columns = track_count(str(metrics["paymentGridColumns"]))
        pipeline_columns = track_count(str(metrics["pipelineGridColumns"]))
        if width >= 1200:
            if metrics["titleFont"] > 29:
                raise AssertionError(f"Collection detail title is oversized: {metrics['titleFont']}px")
            if metrics["heroHeight"] > 175:
                raise AssertionError(f"Collection detail hero wastes vertical space: {metrics['heroHeight']}px")
            if detail_columns < 2:
                raise AssertionError(f"Desktop collection detail lost two-column context/lifecycle composition: {metrics['detailGridColumns']}")
            if payment_columns < 3:
                raise AssertionError(f"Desktop collection payment state lost compact three-column composition: {metrics['paymentGridColumns']}")
            if pipeline_columns < 2:
                raise AssertionError(f"Desktop collection pipeline lost two-column composition: {metrics['pipelineGridColumns']}")
        elif width <= 1100:
            if detail_columns != 1:
                raise AssertionError(f"Narrow collection detail must stack context/lifecycle panels: {metrics['detailGridColumns']}")
            if payment_columns != 1:
                raise AssertionError(f"Narrow collection payment state must stack: {metrics['paymentGridColumns']}")
            if pipeline_columns != 1:
                raise AssertionError(f"Narrow collection pipeline must stack: {metrics['pipelineGridColumns']}")
        if width <= 620:
            for name, value in (
                ("customer 360", metrics["customerActionHeight"]),
                ("policy 360", metrics["policyActionHeight"]),
                ("lifecycle action", metrics["lifecycleActionHeight"]),
                ("pipeline action", metrics["stageActionHeight"]),
            ):
                if value and value < 44:
                    raise AssertionError(f"Collection detail mobile {name} target is too short: {value}px")
            if metrics["titleFont"] > 23:
                raise AssertionError(f"Collection detail mobile title is oversized: {metrics['titleFont']}px")

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
            "event": "COLLECTIONS_R3_VIEWPORT_PASS",
            "directoryViewports": directory_results,
            "detailViewports": detail_results,
        },
        ensure_ascii=False,
    )
)
