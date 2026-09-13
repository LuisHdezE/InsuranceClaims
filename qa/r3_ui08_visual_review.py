import json
import os
import re
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

base = os.environ['QA_WEB_BASE_URL'].rstrip('/')
out = Path(os.environ['REVIEW_DIR'])
seed = json.loads((out / 'seed.json').read_text(encoding='utf-8'))
target_sha = os.environ['REVIEW_TARGET_SHA']

options = webdriver.ChromeOptions()
for arg in ('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--force-device-scale-factor=1'):
    options.add_argument(arg)
options.add_argument('--window-size=1440,1000')
options.binary_location = os.environ['BROWSER_BIN']
driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)
captures = []


def spa_navigate(route: str) -> None:
    driver.execute_script(
        "window.history.pushState({}, '', arguments[0]); window.dispatchEvent(new PopStateEvent('popstate'));",
        route,
    )
    wait.until(lambda browser: browser.current_url.startswith(base + route))


def page_metrics() -> dict:
    return driver.execute_script(
        '''
        const root = document.documentElement;
        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          scrollHeight: Math.max(root.scrollHeight, document.body.scrollHeight),
          h1Count: document.querySelectorAll('h1').length,
          bodyText: document.body.innerText
        };
        '''
    )


def assert_light_surface(name: str, style: dict) -> None:
    rgb_match = re.fullmatch(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', style['background'])
    assert rgb_match, f'{name}: expected opaque light R3 surface, got {style}'
    rgb = tuple(int(channel) for channel in rgb_match.groups())
    assert min(rgb) >= 245, f'{name}: surface is not in approved white/near-white range: {style}'
    radius_match = re.fullmatch(r'([0-9.]+)px', style['radius'])
    assert radius_match, f'{name}: expected pixel border radius, got {style}'
    radius = float(radius_match.group(1))
    assert 8 <= radius <= 14, f'{name}: surface radius outside approved R3 card range: {style}'


def capture(name: str, route: str, width: int, marker: str, required_text: str, surface: str | None, primary: str | None) -> None:
    driver.set_window_size(width, 1000)
    spa_navigate(route)
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, marker)))
    wait.until(lambda browser: required_text.lower() in browser.find_element(By.TAG_NAME, 'body').text.lower())
    time.sleep(0.3)
    metrics = page_metrics()
    overflow = max(0, metrics['scrollWidth'] - metrics['clientWidth'])
    assert overflow <= 2, f'{name}: horizontal overflow at {width}px = {overflow}px'
    assert metrics['h1Count'] == 1, f'{name}: expected one h1 at {width}px, got {metrics["h1Count"]}'
    assert required_text.lower() in metrics['bodyText'].lower(), f'{name}: missing expected text {required_text!r}'

    if primary:
        primary_nodes = driver.find_elements(By.CSS_SELECTOR, primary)
        assert primary_nodes, f'{name}: primary action missing: {primary}'
        assert primary_nodes[0].rect['height'] >= 43, f'{name}: primary action below 44px target: {primary_nodes[0].rect}'

    surface_style = None
    if surface:
        surface_nodes = driver.find_elements(By.CSS_SELECTOR, surface)
        assert surface_nodes, f'{name}: visual surface missing: {surface}'
        surface_style = driver.execute_script(
            'const s=getComputedStyle(arguments[0]); return {background:s.backgroundColor,radius:s.borderRadius};',
            surface_nodes[0],
        )
        assert_light_surface(name, surface_style)

    page_height = int(metrics['scrollHeight'])
    capture_height = min(max(page_height + 32, 1000), 7000)
    driver.set_window_size(width, capture_height)
    driver.execute_script('window.scrollTo(0, 0)')
    time.sleep(0.15)
    filename = f'{name}-{width}.png'
    assert driver.save_screenshot(str(out / filename))
    captures.append({
        'name': name,
        'route': route,
        'width': width,
        'pageHeight': page_height,
        'captureHeight': capture_height,
        'horizontalOverflowPx': overflow,
        'h1Count': metrics['h1Count'],
        'surfaceStyle': surface_style,
        'file': filename,
    })


try:
    driver.get(base + '/operator/login')
    wait.until(EC.visibility_of_element_located((By.ID, 'operator-login'))).send_keys(os.environ['QA_ADMIN_LOGIN'])
    wait.until(EC.visibility_of_element_located((By.ID, 'operator-password'))).send_keys(os.environ['QA_OPERATOR_PASSWORD'])
    wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button.r3-login-submit'))).click()
    wait.until(lambda browser: browser.current_url.startswith(base + '/operator/workspace'))
    assert 'Administrador de plataforma' in driver.find_element(By.TAG_NAME, 'body').text

    scenarios = [
        ('automation-directory', '/operator/admin/automations', '.aa-definition-card', seed['automationDisplayName'], '.aa-definition-card', '.aa-primary-button'),
        ('automation-detail', f"/operator/admin/automations/{seed['automationDefinitionId']}", '.aa-version-card', 'CUANDO', '.aa-version-card', '.aa-primary-button'),
        ('automation-create', '/operator/admin/automations/new', '.aa-editor-section', 'Crear automatización', '.aa-editor-section', '.aa-primary-button'),
        ('pipeline-directory', '/operator/admin/pipelines', '.pipeline-definition-card', seed['pipelineDisplayName'], '.pipeline-definition-card', '.pipeline-primary-button'),
        ('pipeline-detail', f"/operator/admin/pipelines/{seed['pipelineDefinitionId']}", '.pipeline-version-card', 'Recibido', '.pipeline-version-card', '.pipeline-primary-button'),
        ('pipeline-create', '/operator/admin/pipelines/new', '.pipeline-stage-editor-card', 'Crear pipeline', '.pipeline-definition-form-card', '.pipeline-primary-button'),
    ]

    for width in (1440, 390):
        for name, route, marker, required, surface, primary in scenarios:
            capture(name, route, width, marker, required, surface, primary)

    driver.set_window_size(1440, 1000)
    spa_navigate('/operator/admin/pipelines/new')
    consumer_select = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '.pipeline-form-grid select')))
    consumers = [item.get_attribute('value') for item in consumer_select.find_elements(By.TAG_NAME, 'option')]
    assert consumers == ['CLAIM', 'RENEWAL', 'COLLECTION'], f'Unexpected pipeline consumers: {consumers}'

    spa_navigate('/operator/admin/automations/new')
    body = driver.find_element(By.TAG_NAME, 'body').text
    for label in ('CUANDO', 'SI', 'ESPERA', 'ENTONCES'):
        assert label in body, f'Missing automation rule label {label}'
    for forbidden in ('Exportar', 'Ejecutar prueba', 'Métricas de ejecución'):
        assert forbidden not in body, f'Invented capability surfaced: {forbidden}'
finally:
    driver.quit()

summary = {
    'reviewType': 'r3_ui_increment_08_visual_review_v1',
    'reviewTargetSha': target_sha,
    'role': seed['role'],
    'apiAuthoritative': True,
    'rbacAuthoritative': True,
    'businessData': 'SYNTHETIC_QA_VIA_REAL_API_POSTGRESQL',
    'views': captures,
    'result': 'PASS',
}
(out / 'r3-ui08-visual-review.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
