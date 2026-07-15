# Security Review Workflow

> Revisa un cambio o el repo completo buscando riesgos de seguridad antes de mergear.

## When to use

- Antes de mergear un PR con cambios en autenticación, autorización, parsing de input o manejo de secretos.
- Cuando se agrega una nueva dependencia o integración externa.
- Periódicamente como revisión de sanity del repositorio.

## Steps

1. **Inventario de superficie de ataque**
   - Lista endpoints (`src/api/routes/`), webhooks (`src/api/routes/webhook.ts`), notifiers y tool callers.
2. **Secretos y credenciales**
   - Busca tokens, keys o contraseñas hardcodeadas con `grep`.
   - Verifica que `.env.example` documente todas las variables sensibles.
   - Confirma que `src/tools/git.ts` y similares no logueen secretos.
3. **Validación de input**
   - Revisa que los endpoints validen y sanitizen body/params/query.
   - Verifica que `src/tools/jira.ts`, `src/tools/slack.ts`, etc., no pasen input crudo a LLM o shell.
4. **Dependencias**
   - Corre `npm audit` y evalúa findings críticos.
   - Revisa que no se instalen paquetes innecesarios o no auditados.
5. **Permisos de GitHub/Git**
   - Revisa scopes de `GITHUB_TOKEN`, manejo de errores y paths inyectados.
6. **Reporte**
   - Escribe un resumen en `progress/security-review-<fecha>.md`.
   - Si hay riesgo crítico, no continues hasta que el usuario lo autorice.

## Verification

- `npm audit` sin vulnerabilidades críticas.
- `grep -R` de palabras clave (`password`, `token`, `secret`, `api_key`, `apikey`) sin hits hardcodeados.
