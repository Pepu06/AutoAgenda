# Eliminación del campo `slug`

## Resumen
El campo `slug` de la tabla `tenants` fue eliminado porque no se utilizaba para ninguna funcionalidad real (routing, lookups, etc). Solo se validaba su unicidad durante el registro pero nunca se usaba después.

## Archivos modificados

### Backend
- `apps/api/src/controllers/auth.controller.js`
  - Eliminado parámetro `slug` del registro
  - Eliminada validación de slug único
  - Simplificado registro con Google OAuth (ya no genera slug)
  - **BONUS**: Agregado logging de errores en envío de emails

- `apps/api/src/controllers/settings.controller.js`
  - Eliminado `slug` de SELECT_COLS

### Frontend
- `apps/web/src/app/(auth)/register/page.jsx`
  - Eliminado campo de input "Slug (identificador único)"
  - Actualizado state inicial del formulario

### Database
- `packages/db/schema.sql`
  - Removida columna `slug` de tabla `tenants`
  
- `packages/db/prisma/schema.prisma`
  - Removido campo `slug` del modelo `Tenant`

- `packages/db/migrations/remove_slug.sql` (NUEVO)
  - Migración SQL para eliminar la columna

## Migración pendiente

**IMPORTANTE**: Ejecutar esta migración en Supabase SQL Editor:

```sql
ALTER TABLE tenants DROP COLUMN IF EXISTS slug;
```

### Cómo aplicar:
1. Ir a: https://supabase.com/dashboard/project/yxrypsdybldauzwtkphq/sql/new
2. Pegar el contenido de `packages/db/migrations/remove_slug.sql`
3. Ejecutar (Run)

## Validación

Después de aplicar la migración, verificar que:
1. Los usuarios existentes NO se vean afectados
2. El registro de nuevos usuarios funcione sin pedir slug
3. Google OAuth siga funcionando correctamente
