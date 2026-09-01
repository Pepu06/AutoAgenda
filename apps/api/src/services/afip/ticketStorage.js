const { supabase } = require('@autoagenda/db');
const logger = require('../../config/logger');

/**
 * ITicketStoragePort de @arcasdk/core respaldado en Supabase.
 *
 * El ticket de acceso WSAA dura 12 horas y AFIP rechaza emitir uno nuevo
 * mientras haya uno vigente. El MemoryTicketStorage que trae el SDK lo guarda
 * en un Map del proceso, así que cada redeploy lo pierde y deja al tenant sin
 * facturar hasta que el ticket viejo expire. Persistirlo evita eso.
 *
 * Se serializa igual que MemoryTicketStorage: { header, credentials }.
 */
function createTicketStorage({ tenantId, production, AccessTicket }) {
  return {
    async save(ticket, serviceName) {
      const ticketJson = {
        header: ticket.getHeaders(),
        credentials: ticket.getCredentials(),
      };

      const { error } = await supabase
        .from('afip_tickets')
        .upsert({
          tenant_id: tenantId,
          service_name: String(serviceName),
          production,
          ticket_json: ticketJson,
          expires_at: ticket.getExpiration().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,service_name,production' });

      if (error) {
        // No es fatal: sin ticket guardado el SDK pide uno nuevo. Se loguea
        // para poder correlacionar si aparecen rechazos de WSAA.
        logger.warn({ err: error.message, tenantId }, 'afip_ticket_save_failed');
      }
    },

    async get(serviceName) {
      const { data, error } = await supabase
        .from('afip_tickets')
        .select('ticket_json')
        .eq('tenant_id', tenantId)
        .eq('service_name', String(serviceName))
        .eq('production', production)
        .maybeSingle();

      if (error || !data) return null;

      try {
        const ticket = AccessTicket.create(data.ticket_json);
        // Un ticket vencido es peor que ninguno: el SDK lo usaría y AFIP
        // devolvería un error de autenticación en vez de renovarlo.
        return ticket.isExpired() ? null : ticket;
      } catch (err) {
        logger.warn({ err: err.message, tenantId }, 'afip_ticket_parse_failed');
        return null;
      }
    },

    async delete(serviceName) {
      await supabase
        .from('afip_tickets')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('service_name', String(serviceName))
        .eq('production', production);
    },
  };
}

module.exports = { createTicketStorage };
