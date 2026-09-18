from __future__ import annotations

import json
import os
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

WEB_BASE_URL = os.environ.get("QA_WEB_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
TOLERANCE_PX = 2

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--force-device-scale-factor=1")

browser_bin = os.environ.get("BROWSER_BIN")
if browser_bin:
    options.binary_location = browser_bin

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)

try:
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": 1024, "height": 768, "deviceScaleFactor": 1, "mobile": False},
    )
    driver.get(f"{WEB_BASE_URL}/operator/login")
    wait.until(EC.visibility_of_element_located((By.ID, "operator-login"))).send_keys(
        "demo.operator@eliasworks.invalid"
    )
    driver.find_element(By.ID, "operator-password").send_keys("visual-qa-password")
    submit = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "form.operator-form button[type='submit']"))
    )
    submit.click()
    wait.until(lambda d: "/operator/" in d.current_url and "/login" not in d.current_url)

    driver.get(f"{WEB_BASE_URL}/operator/customers")
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".r3-customer-directory")))
    wait.until(lambda d: "María Fernández" in d.find_element(By.CSS_SELECTOR, ".cp360-table").text)
    time.sleep(0.2)

    metrics = driver.execute_script(
        """
        const root = document.documentElement;
        const body = document.body;
        const wrap = document.querySelector('.r3-customer-directory .cp360-table-wrap');
        const table = document.querySelector('.r3-customer-directory .cp360-table');
        const head = document.querySelector('.r3-customer-directory .cp360-table thead');
        const row = document.querySelector('.r3-customer-directory .cp360-table tbody tr');
        return {
          innerWidth: window.innerWidth,
          pageScrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
          tableDisplay: table ? getComputedStyle(table).display : '',
          tableMinWidth: table ? getComputedStyle(table).minWidth : '',
          theadDisplay: head ? getComputedStyle(head).display : '',
          rowDisplay: row ? getComputedStyle(row).display : '',
          tableScrollWidth: wrap ? wrap.scrollWidth : 0,
          tableClientWidth: wrap ? wrap.clientWidth : 0,
        };
        """
    )

    page_overflow = metrics["pageScrollWidth"] - metrics["innerWidth"]
    table_overflow = metrics["tableScrollWidth"] - metrics["tableClientWidth"]

    if page_overflow > TOLERANCE_PX:
        raise AssertionError(f"Customer directory page overflow at 1024px: {page_overflow}px")
    if table_overflow > TOLERANCE_PX:
        raise AssertionError(f"Customer directory internal table overflow at 1024px: {table_overflow}px")
    if metrics["theadDisplay"] != "none":
        raise AssertionError(f"1024px customer directory must hide table header: {metrics['theadDisplay']}")
    if metrics["rowDisplay"] != "grid":
        raise AssertionError(f"1024px customer directory must render cards: {metrics['rowDisplay']}")
    if metrics["tableMinWidth"] != "0px":
        raise AssertionError(f"1024px customer directory must remove table min-width: {metrics['tableMinWidth']}")

    print(
        json.dumps(
            {
                "event": "CUSTOMERS_R3_TABLET_CONTAINMENT_PASS",
                **metrics,
                "pageOverflow": page_overflow,
                "tableOverflow": table_overflow,
            },
            ensure_ascii=False,
        )
    )
finally:
    try:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    except Exception:
        pass
    driver.quit()
