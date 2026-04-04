# Planes de AutoAgenda

## 🎯 Propuesta de Valor

**"Si un paciente falta a una consulta de $40.000 ARS, perdiste esa plata. Si invertís $25.000 en AutoAgenda, con que salves un solo turno que se iba a perder, la app ya se pagó sola y te dio ganancia."**

---

## 📋 Planes Disponibles

### 🆓 Trial (Gratis por 15 días)
**Precio:** Gratis por 15 días

**Incluye:**
- ✅ Mensajes ilimitados por 15 días
- ✅ 1 agenda de Google Calendar
- ✅ Confirmaciones automáticas
- ✅ Recordatorios programados
- ✅ Panel de control básico

**Ideal para:** Probar el sistema sin compromiso

---

### 💼 Plan Inicial
**Precio:** $25.000 ARS / mes (aprox. $20 USD)

**Incluye:**
- ✅ 1 agenda de Google Calendar
- ✅ 100 recordatorios de WhatsApp/mes
- ✅ Confirmaciones automáticas
- ✅ Recordatorios programados
- ✅ Panel de control completo
- ✅ Soporte por email
- 💰 **$150 ARS por mensaje adicional**

**Ideal para:** Profesionales independientes (médicos, psicólogos, nutricionistas, contadores, etc.)

**ROI:** Con que salves 1 turno perdido de $40.000, ya recuperaste la inversión y ganaste $15.000.

---

### 🏢 Plan Profesional
**Precio:** $55.000 ARS / mes (aprox. $45 USD)

**Incluye:**
- ✅ Hasta 3 agendas de Google Calendar
- ✅ 500 recordatorios de WhatsApp/mes
- ✅ Confirmaciones automáticas
- ✅ Recordatorios programados
- ✅ Panel de control completo
- ✅ Soporte técnico prioritario
- ✅ Estadísticas avanzadas
- ✅ Múltiples usuarios
- 💰 **$120 ARS por mensaje adicional**

**Ideal para:** Consultorios médicos, inmobiliarias, estudios contables, clínicas pequeñas

**ROI:** Reducí las ausencias hasta un 80%. Con 2 turnos salvados al mes ya recuperaste la inversión.

---

### 🚀 Plan Custom (B2B Corporativo)
**Precio:** Desde $120.000 ARS / mes (a medida)

**Incluye:**
- ✅ Agendas ilimitadas
- ✅ Mensajes masivos sin límite
- ✅ Integración con CRM propio
- ✅ API personalizada
- ✅ Soporte dedicado 24/7
- ✅ Reportes personalizados
- ✅ Onboarding y capacitación
- 💼 **Precio a medida según volumen**

**Ideal para:** Hospitales, cadenas de clínicas, empresas con múltiples sedes, corporativos

**Nota:** Requiere contacto con ventas para cotización personalizada.

---

## 💡 ¿Por qué AutoAgenda?

### El Problema
- **40-60% de ausencias** sin sistema de recordatorios
- Pérdida de tiempo y dinero por turnos fantasma
- Agendas desorganizadas
- Pacientes/clientes que olvidan sus citas

### La Solución
- **Hasta 80% menos ausencias** con recordatorios automáticos
- Confirmaciones instantáneas por WhatsApp
- Integración directa con Google Calendar
- Sin instalaciones complicadas

### El Retorno
- **Plan Inicial ($25k/mes):** Salvás 1 turno de $40k = +$15k de ganancia
- **Plan Profesional ($55k/mes):** Salvás 2 turnos de $40k = +$25k de ganancia
- **Menos stress:** No más llamadas manuales ni olvidos

---

## 🔧 Configuración de Precios en el Código

Los precios están configurados en:
- **Backend:** `/apps/api/src/services/mercadopago.js`
- **Enum de planes:** `/packages/db/prisma/schema.prisma`

```javascript
const PLANS = {
  inicial: {
    price: 25000, // $25.000 ARS/mes
    messageLimit: 100,
    extraMessagePrice: 150, // $150 por mensaje extra
  },
  profesional: {
    price: 55000, // $55.000 ARS/mes
    messageLimit: 500,
    extraMessagePrice: 120, // $120 por mensaje extra
  },
  custom: {
    price: 120000, // Desde $120.000 ARS
    messageLimit: null, // ilimitado
  },
};
```

---

## 📊 Comparativa de Planes

| Feature | Trial | Inicial | Profesional | Custom |
|---------|-------|---------|-------------|--------|
| **Precio** | Gratis 15 días | $25.000/mes | $55.000/mes | Desde $120.000 |
| **Mensajes** | Ilimitados | 100/mes | 500/mes | Ilimitados |
| **Extra msg** | - | $150 | $120 | - |
| **Agendas** | 1 | 1 | 3 | Ilimitadas |
| **Soporte** | Email | Email | Prioritario | Dedicado 24/7 |
| **Usuarios** | 1 | 1 | Múltiples | Ilimitados |
| **CRM** | ❌ | ❌ | ❌ | ✅ Custom |
| **API** | ❌ | ❌ | ❌ | ✅ Personalizada |
