import json
import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE = os.environ['QA_WEB_BASE_URL'].rstrip('/')
OUT = Path('.runtime/increment07-review-v1')
OUT.mkdir(parents=True, exist_ok=True)
SHOTS = []


def make_driver():
    options = webdriver.ChromeOptions()
    for arg in ('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--force-device-scale-factor=1'):
        options.add_argument(arg)
    options.add_argument('--window-size=1440,1100')
    options.binary_location = os.environ['BROWSER_BIN']
    return webdriver.Chrome(options=options)


def login(driver, login_name):
    wait = WebDriverWait(driver, 25)
    driver.get(BASE + '/operator/login')
    wait.until(EC.presence_of_element_located((By.ID, 'operator-login'))).send_keys(login_name)
    driver.find_element(By.ID, 'operator-password').send_keys(os.environ['QA_OPERATOR_PASSWORD'])
    driver.find_element(By.CSS_SELECTOR, 'button.r3-login-submit').click()
    wait.until(lambda d: d.execute_script("return location.pathname !== '/operator/login'"))
    return wait


def spa_go(driver, wait, path, selector):
    driver.execute_script(
        "history.pushState({}, '', arguments[0]); window.dispatchEvent(new PopStateEvent('popstate'));",
        path,
    )
    wait.until(lambda d: d.execute_script('return location.pathname') == path)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))


def page_metrics(driver):
    return driver.execute_script(
        """const r=document.documentElement;return {
        clientWidth:r.clientWidth,scrollWidth:r.scrollWidth,
        scrollHeight:Math.max(r.scrollHeight,document.body.scrollHeight),
        h1Count:document.querySelectorAll('h1').length,
        bodyText:document.body.innerText};"""
    )


def capture(driver, prefix, width, kind):
    driver.set_window_size(width, 1000)
    time.sleep(0.5)
    measured = page_metrics(driver)
    height = min(max(int(measured['scrollHeight']) + 40, 1000), 6500)
    driver.set_window_size(width, height)
    time.sleep(0.25)
    driver.execute_script('window.scrollTo(0,0)')
    suffix = 'desktop' if width == 1440 else 'mobile'
    path = OUT / f'{prefix}-{suffix}.png'
    assert driver.save_screenshot(str(path))
    SHOTS.append({
        'kind': kind,
        'width': width,
        'height': height,
        'overflow': max(0, int(measured['scrollWidth']) - int(measured['clientWidth'])),
        'h1Count': int(measured['h1Count']),
        'file': path.name,
    })


def write_workspace_debug(driver, body):
    metrics = page_metrics(driver)
    debug = {
        'pathname': driver.execute_script('return location.pathname'),
        'title': driver.title,
        'h1Count': int(metrics['h1Count']),
        'overflow': max(0, int(metrics['scrollWidth']) - int(metrics['clientWidth'])),
        'bodyText': body,
    }
    (OUT / 'workspace-debug.json').write_text(json.dumps(debug, indent=2, ensure_ascii=False), encoding='utf-8')
    driver.set_window_size(1440, min(max(int(metrics['scrollHeight']) + 40, 1000), 6500))
    time.sleep(0.2)
    driver.execute_script('window.scrollTo(0,0)')
    assert driver.save_screenshot(str(OUT / 'workspace-debug.png'))


supervisor = make_driver()
try:
    wait = login(supervisor, os.environ['QA_SUPERVISOR_LOGIN'])
    spa_go(supervisor, wait, '/operator/analytics', '.claims-analytics-main')
    wait.until(lambda d: 'Cargando métricas autoritativas' not in d.find_element(By.TAG_NAME, 'body').text)
    body = supervisor.find_element(By.TAG_NAME, 'body').text
    for required in (
        'Métricas operacionales', 'Claims abiertos', 'Claims cerrados', 'Tareas abiertas',
        'Tareas vencidas', 'Evidencia pendiente', 'Distribución por estado',
        'Etapas operacionales', 'Respuesta R3 autoritativa',
    ):
        assert required in body, required
    for forbidden in ('Exportar', 'Comparar períodos', 'Forecast'):
        assert forbidden not in body, forbidden
    options = [element.text for element in supervisor.find_elements(By.CSS_SELECTOR, '.r3-window-control option')]
    assert options == ['Últimos 7 días', 'Últimos 30 días', 'Últimos 90 días'], options
    capture(supervisor, 'analytics', 1440, 'analytics')
    capture(supervisor, 'analytics', 390, 'analytics')
finally:
    supervisor.quit()

admin = make_driver()
try:
    wait = login(admin, os.environ['QA_ADMIN_LOGIN'])
    spa_go(admin, wait, '/operator/workspace', '.r3-increment-07-workspace')
    wait.until(lambda d: 'Tu espacio de trabajo' in d.find_element(By.TAG_NAME, 'body').text)
    time.sleep(0.5)
    body = admin.find_element(By.TAG_NAME, 'body').text
    write_workspace_debug(admin, body)
    for required in (
        'Tu espacio de trabajo', 'Administrador de plataforma', 'Supervisión',
        'Configuración de plataforma', 'Operación técnica', 'Métricas operacionales',
        'Administración de pipelines', 'Plantillas de comunicación', 'Custom Fields',
        'Guidance', 'Automations', 'Imports gobernados', 'Integraciones y recuperación',
        'Sin superusuario implícito',
    ):
        assert required in body, required
    for forbidden in (
        'Siniestros y trabajo operativo', 'Clientes y pólizas', 'Renovaciones', 'Cobranzas',
        'UI planificada', 'permisos de presentación sincronizados',
    ):
        assert forbidden not in body, forbidden
    capture(admin, 'workspace-platform-admin', 1440, 'workspace-platform-admin')
    capture(admin, 'workspace-platform-admin', 390, 'workspace-platform-admin')
finally:
    admin.quit()

assert all(shot['overflow'] == 0 for shot in SHOTS), SHOTS
assert all(shot['h1Count'] == 1 for shot in SHOTS), SHOTS

summary = {
    'review_type': 'r3_analytics_workspace_visual_review_v1',
    'review_target_sha': os.environ['REVIEW_TARGET_SHA'],
    'analytics_role': 'CLAIMS_SUPERVISOR',
    'workspace_role': 'PLATFORM_ADMIN',
    'api_authoritative': True,
    'navigation': 'spa_preserves_in_memory_session',
    'shots': SHOTS,
    'result': 'PASS',
}
(OUT / 'increment07-visual-review.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary))
