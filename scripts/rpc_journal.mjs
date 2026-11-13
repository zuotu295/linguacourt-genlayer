// Persist signed Studio submissions before HTTP; never retry ambiguous broadcasts.
// The caller stores journal events in a private checkpoint, never public evidence.
export function createJournaledFetch({fetchImpl, getLabel, onEvent}) {
  const submitted = new Set();
  return async (url, init = {}) => {
    let request;
    try { request = JSON.parse(init.body); } catch { return fetchImpl(url, init); }
    if (request.method !== 'eth_sendRawTransaction') return fetchImpl(url, init);
    const label = getLabel();
    if (!label) throw new Error('BROADCAST_WITHOUT_LABEL');
    if (submitted.has(label)) throw new Error('BROADCAST_ALREADY_ATTEMPTED: reconcile checkpoint before retry');
    submitted.add(label);
    onEvent({label, stage:'before_broadcast', serialized_transaction:request.params?.[0]});
    try {
      const response = await fetchImpl(url, init);
      let data;
      try { data = await response.clone().json(); } catch {
        onEvent({label,stage:'ambiguous_response',http_status:response.status});
        return response;
      }
      if (typeof data.result === 'string' && /^0x[0-9a-fA-F]{64}$/.test(data.result)) {
        onEvent({label,stage:'hash_received',hash:data.result});
      } else {
        onEvent({label,stage:'ambiguous_response',http_status:response.status,rpc_error:data.error || null});
      }
      return response;
    } catch (error) {
      onEvent({label,stage:'ambiguous_response',error:String(error.message || error)});
      throw error;
    }
  };
}
