# Release Checklist Workflow

> Pasos para publicar una nueva versión de GAIA Code Harness.

## When to use

- Cuando se va a taggear una release (`vX.Y.Z`).
- Antes de deployar a producción el Modo HTTP.

## Steps

1. **Congelar features**
   - Revisa `feature_list.json`; no debe haber features `in_progress`.
   - Asegúrate de que solo queden `done` o `blocked` para la siguiente versión.
2. **Tests y compilación**
   - `./init.sh` pasa.
   - `npx tsc --noEmit` pasa.
   - `npm test` pasa (o documenta por qué no aplica).
3. **Documentación**
   - Actualiza `README.md` si hay cambios de uso.
   - Actualiza `API.md` si cambió la API REST/Webhook.
   - Actualiza `docs/guides/production.md` si cambian requisitos de deploy.
4. **Changelog**
   - Resume commits desde el último tag: `git log <last-tag>..HEAD --oneline`.
   - Escribe `CHANGELOG.md` o actualízalo.
5. **Version bump**
   - Actualiza `version` en `package.json`.
   - Actualiza `package-lock.json` con `npm install`.
6. **Tag y release**
   - `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
   - `git push origin vX.Y.Z`.
   - Crea release notes en GitHub (puede ser manual o via API).
7. **Deploy (Modo HTTP)**
   - Verifica variables de entorno en producción.
   - Corre migraciones de DB si aplica.
   - Despliega y revisa health checks.

## Verification

- `git tag` muestra el nuevo tag.
- `npm run build` genera `dist/` sin errores.
- El servidor de staging responde a `GET /health`.

## Output

- `progress/release-vX.Y.Z.md` con resumen de cambios, decisiones y validaciones.
