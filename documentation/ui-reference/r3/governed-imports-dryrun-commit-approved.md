# Importaciones Gobernadas R3 — Dry-run + Commit aprobado

Estado: **APROBADO por Luis**.

Esta referencia visual fija los pasos finales del workflow de Importaciones Gobernadas R3 y debe implementarse respetando el contrato existente, sin ampliar alcance funcional.

## Contrato representado

- Tipo único: `SYNTHETIC_REFERENCE_RECORDS`.
- Formatos de entrada: CSV o XLSX.
- Tamaño máximo: 10 MiB.
- Límite: 5.000 filas por archivo.
- Mapping visible: `externalReference`, `label` y `classification` opcional.
- Resultados de dry-run: `CREATE`, `UPDATE`, `UNCHANGED`, `REJECTED`.
- `stagedInput` crudo no se expone en UI.
- El commit solo se habilita desde `DRY_RUN_READY`.
- Toda mutación usa `expectedVersion`.
- Ante `409`, la UI recarga estado autoritativo y no repite ciegamente la mutación obsoleta.
- El commit conserva su `Idempotency-Key` durante el reintento lógico del mismo intento.

## Reglas visuales

- Sidebar navy oscuro, igual al resto del baseline R3.
- UI visible en español.
- Azul como acción primaria; rojo reservado para la confirmación sensible de commit.
- Alta densidad de información, paneles compactos y jerarquía operacional clara.
- La vista móvil conserva el mismo orden mental del workflow, sin introducir capacidades distintas.

## Referencia

`governed-imports-dryrun-commit-approved.svg`
