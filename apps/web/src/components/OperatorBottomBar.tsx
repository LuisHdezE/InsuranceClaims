import { Link } from 'react-router-dom';

export function OperatorBottomBar() {
  return (
    <div className="ops-sidebar-footer r3-ui-sidebar-footer operator-sidebar-footer">
      <Link className="ops-public-link" to="/">Sitio público ↗</Link>
      <strong>Centro de Operaciones R3</strong>
      <span>Caso técnico no oficial · No oficial · Sin afiliación</span>
      <span>Datos exclusivamente sintéticos.</span>
    </div>
  );
}
