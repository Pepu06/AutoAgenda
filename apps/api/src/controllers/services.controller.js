const { supabase, convertKeys } = require('@autoagenda/db');
const { NotFoundError } = require('../errors');

async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function create(req, res, next) {
  try {
    const { name, durationMinutes, price } = req.body;
    
    // Validate required fields
    if (!name || !durationMinutes) {
      return res.status(400).json({ 
        success: false, 
        error: 'name and durationMinutes are required' 
      });
    }
    
    const { data, error } = await supabase
      .from('services')
      .insert({ 
        tenant_id: req.tenantId, 
        name, 
        duration_minutes: Number(durationMinutes) || 30,
        price: price != null ? Number(price) : 0
      })
      .select().single();
    if (error) throw error;
    return res.status(201).json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function getOne(req, res, next) {
  try {
    const { data } = await supabase
      .from('services').select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!data) throw new NotFoundError('Service not found');
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('services').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Service not found');

    const { name, durationMinutes, price } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (durationMinutes !== undefined) updateData.duration_minutes = Number(durationMinutes) || 30;
    if (price !== undefined) updateData.price = price != null ? Number(price) : 0;
    
    const { data, error } = await supabase
      .from('services')
      .update(updateData)
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function remove(req, res, next) {
  try {
    const { data: existing } = await supabase
      .from('services').select('id').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!existing) throw new NotFoundError('Service not found');

    const { error } = await supabase.from('services').delete().eq('id', req.params.id);
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({ success: false, error: 'No se puede eliminar el servicio porque tiene citas asociadas' });
      }
      throw error;
    }
    return res.json({ success: true, data: null });
  } catch (err) { return next(err); }
}

module.exports = { list, create, getOne, update, remove };
