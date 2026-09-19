from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_SRC = ROOT / "apps" / "web" / "src"

nav_source = (WEB_SRC / "operator-navigation.ts").read_text(encoding="utf-8")
app_source = (WEB_SRC / "App.tsx").read_text(encoding="utf-8")
workspace_source = (WEB_SRC / "pages" / "StaffWorkspacePage.tsx").read_text(encoding="utf-8")
shell_source = (WEB_SRC / "components" / "OperatorShell.tsx").read_text(encoding="utf-8")
sidebar_source = (WEB_SRC / "components" / "OperatorSidebar.tsx").read_text(encoding="utf-8")

nav_items = re.findall(
    r"\{\s*to:\s*'([^']+)'[\s\S]*?maturity:\s*'(ready|pending)'[\s\S]*?\n\s*\},",
    nav_source,
)
if not nav_items:
    raise AssertionError("No operator navigation items could be parsed")

if len({path for path, _ in nav_items}) != len(nav_items):
    raise AssertionError("Operator navigation contains duplicate top-level paths")

page_imports = {
    component: module
    for component, module in re.findall(
        r"import\s+\{\s*(\w+Page)\s*\}\s+from\s+'\./pages/([^']+)'",
        app_source,
    )
}

route_components: dict[str, str] = {}
for line in app_source.splitlines():
    path_match = re.search(r'<Route path="([^"]+)"', line)
    if not path_match:
        continue
    component_match = re.search(r'<(\w+Page)\s*/>', line)
    if component_match:
        route_components[path_match.group(1)] = component_match.group(1)

missing_routes: list[str] = []
missing_shell: list[str] = []
for path, maturity in nav_items:
    component = route_components.get(path)
    if not component:
        missing_routes.append(f"{path} ({maturity})")
        continue
    module = page_imports.get(component)
    if not module:
        missing_routes.append(f"{path} -> {component} has no page import")
        continue
    page_path = WEB_SRC / "pages" / f"{module}.tsx"
    if not page_path.exists():
        missing_routes.append(f"{path} -> {page_path.relative_to(ROOT)} missing")
        continue
    page_source = page_path.read_text(encoding="utf-8")
    if "OperatorShell" not in page_source or "<OperatorShell>" not in page_source:
        missing_shell.append(f"{path} -> {page_path.relative_to(ROOT)}")

if missing_routes:
    raise AssertionError("Navigation paths without real top-level routes: " + "; ".join(missing_routes))
if missing_shell:
    raise AssertionError("Navigation pages outside reusable OperatorShell: " + "; ".join(missing_shell))

if "OperatorSidebar" not in shell_source or "OperatorTopbar" not in shell_source:
    raise AssertionError("OperatorShell must compose OperatorSidebar and OperatorTopbar")
if "OperatorBottomBar" not in sidebar_source:
    raise AssertionError("OperatorSidebar must compose OperatorBottomBar")
if "OPERATOR_NAV_ITEMS" not in sidebar_source:
    raise AssertionError("OperatorSidebar must consume canonical OPERATOR_NAV_ITEMS")

if "const WORKSPACE_CARDS" in workspace_source or "const WORKSPACE_GROUPS" in workspace_source:
    raise AssertionError("StaffWorkspacePage must not own a parallel navigation catalog")
if "operatorWorkspaceCardsForRole" not in workspace_source:
    raise AssertionError("StaffWorkspacePage must derive cards from canonical operator navigation")
if "OPERATOR_WORKSPACE_CARDS" not in nav_source or "operatorWorkspaceCardsForRole" not in nav_source:
    raise AssertionError("Canonical operator navigation must own the workspace capability model")

ready = [path for path, maturity in nav_items if maturity == "ready"]
pending = [path for path, maturity in nav_items if maturity == "pending"]

print({
    "event": "OPERATOR_NAVIGATION_INTEGRATION_PASS",
    "totalModules": len(nav_items),
    "readyModules": len(ready),
    "pendingModules": len(pending),
    "readyPaths": ready,
    "pendingPaths": pending,
})
