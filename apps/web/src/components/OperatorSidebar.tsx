import { Link, NavLink } from 'react-router-dom';
import type { StaffRole } from '../api/types';
import {
  OPERATOR_NAV_GROUPS,
  OPERATOR_NAV_ITEMS,
  operatorNavItemCanLink,
  operatorNavItemsForRole,
  type OperatorNavItem,
} from '../operator-navigation';
import { OperatorBottomBar } from './OperatorBottomBar';
import '../operator-sidebar-foundation.css';

export function OperatorSidebar({
  role,
  demoReadOnly,
  brandDestination,
}: {
  role: StaffRole | undefined;
  demoReadOnly: boolean;
  brandDestination: string;
}) {
  const items = demoReadOnly
    ? OPERATOR_NAV_ITEMS.filter((item) => operatorNavItemCanLink(item, role))
    : role
      ? operatorNavItemsForRole(role)
      : [];

  return (
    <aside
      className="ops-sidebar r3-ui-sidebar operator-sidebar-component"
      aria-label="Navegación principal del Centro de Operaciones"
    >
      <Link
        className="ops-brand r3-ui-brand operator-sidebar-brand"
        to={brandDestination}
        aria-label="Ir al espacio de trabajo del Centro de Operaciones"
      >
        <span className="r3-ui-brand-mark" aria-hidden="true">IC</span>
        <span className="r3-ui-brand-copy">
          <strong className="r3-ui-brand-name">InsuranceClaims</strong>
          <span className="r3-ui-brand-tagline">Centro de Operaciones</span>
        </span>
      </Link>

      <nav className="ops-nav r3-ui-nav operator-sidebar-nav">
        {OPERATOR_NAV_GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group.key);
          if (groupItems.length === 0) return null;

          return (
            <section className="r3-ui-nav-group" aria-labelledby={`r3-nav-${group.key}`} key={group.key}>
              <h2 id={`r3-nav-${group.key}`} className="r3-ui-nav-label">{group.label}</h2>
              <div className="r3-ui-nav-links">
                {groupItems.map((item) => (
                  <OperatorSidebarItem
                    key={item.to}
                    item={item}
                    role={role}
                    demoReadOnly={demoReadOnly}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </nav>

      <OperatorBottomBar />
    </aside>
  );
}

function OperatorSidebarItem({
  item,
  role,
  demoReadOnly,
}: {
  item: OperatorNavItem;
  role: StaffRole | undefined;
  demoReadOnly: boolean;
}) {
  const canLink = operatorNavItemCanLink(item, role);

  if (!canLink) {
    const disabledReason = demoReadOnly
      ? 'No disponible en la demo pública'
      : 'Vista pendiente de refinamiento visual';

    return (
      <span
        className="ops-nav-link operator-sidebar-item is-pending"
        aria-disabled="true"
        title={disabledReason}
      >
        <span className="ops-nav-icon" aria-hidden="true">{item.glyph}</span>
        <span className="operator-sidebar-item-label">{item.label}</span>
        <span className="operator-sidebar-pending-dot" aria-hidden="true" />
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `ops-nav-link operator-sidebar-item${isActive ? ' is-active' : ''}`}
    >
      <span className="ops-nav-icon" aria-hidden="true">{item.glyph}</span>
      <span className="operator-sidebar-item-label">{item.label}</span>
    </NavLink>
  );
}
