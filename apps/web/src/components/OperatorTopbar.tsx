import type { StaffRole } from '../api/types';
import { STAFF_ROLE_LABELS } from '../auth/staff-access';

export function OperatorTopbar({
  context,
  login,
  role,
  demoReadOnly,
  onSignOut,
}: {
  context: string;
  login: string | undefined;
  role: StaffRole | undefined;
  demoReadOnly: boolean;
  onSignOut: () => void;
}) {
  return (
    <header className="operator-header ops-topbar r3-ui-topbar">
      <div className="ops-topbar-title r3-ui-topbar-title">
        <strong>Centro de Operaciones</strong>
        <span>{context}</span>
        <small className="ops-mobile-disclosure">
          Caso técnico no oficial · No oficial · Sin afiliación
          <br />
          Datos exclusivamente sintéticos.
        </small>
      </div>

      <label className="ops-global-search r3-ui-global-search">
        <span className="sr-only">Búsqueda global</span>
        <input type="search" placeholder="Búsqueda global · próximo corte" disabled />
      </label>

      <div className="ops-operator-area r3-ui-operator-area">
        <span className="ops-avatar" aria-hidden="true">{operatorInitials(login)}</span>
        <span className="r3-operator-copy">
          <strong className="operator-identity">{login}</strong>
          {role && <small className="r3-topbar-role">{STAFF_ROLE_LABELS[role]}</small>}
          {demoReadOnly && (
            <small className="r3-topbar-role">Demo pública · solo lectura · fixtures gobernados</small>
          )}
        </span>
        <button className="ops-signout" type="button" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </header>
  );
}

function operatorInitials(login: string | undefined) {
  if (!login) return 'OP';
  const local = login.split('@')[0] ?? login;
  const parts = local.split(/[._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'OP';
}
