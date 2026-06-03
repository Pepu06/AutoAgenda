const { supabase, convertKeys } = require('@autoagenda/db');
const { NotFoundError } = require('../errors');

async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function create(req, res, next) {
  try {
    const { name, phone, notes, email, dni, birthDate } = req.body;

    const [{ data: byPhone }, { data: byName }] = await Promise.all([
      supabase.from('contacts').select('id').eq('tenant_id', req.tenantId).eq('phone', phone).limit(1),
      supabase.from('contacts').select('id').eq('tenant_id', req.tenantId).ilike('name', name).limit(1),
    ]);

    if (byPhone && byPhone.length > 0) {
      return res.status(409).json({ success: false, error: 'Ya existe un contacto con ese teléfono' });
    }
    if (byName && byName.length > 0) {
      return res.status(409).json({ success: false, error: 'Ya existe un contacto con ese nombre' });
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert({ tenant_id: req.tenantId, name, phone, notes, email: email || null, dni: dni || null, birth_date: birthDate || null })
      .select().single();
    if (error) throw error;
    return res.status(201).json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function getOne(req, res, next) {
  try {
    const { data } = await supabase
      .from('contacts').select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!data) throw new NotFoundError('Contact not found');
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('contacts').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Contact not found');

    const { name, phone, notes, email, dni, birthDate } = req.body;
    const { data, error } = await supabase
      .from('contacts').update({ name, phone, notes, email: email || null, dni: dni || null, birth_date: birthDate || null }).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function remove(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('contacts').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Contact not found');

    const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true, data: null });
  } catch (err) { return next(err); }
}

module.exports = { list, create, getOne, update, remove };
