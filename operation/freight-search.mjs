const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function searchForm(filters,branches,stages){
 const options=(items,value)=>items.map(([id,label])=>'<option value="'+esc(id)+'" '+(id===value?'selected':'')+'>'+esc(label)+'</option>').join('');
 return '<form data-freight-filters><label>Buscar código interno, NF, CT-e ou cliente<input name="term" type="search" maxlength="120" data-freight-search value="'+esc(filters.term)+'"></label><label>Filial<select name="branch_id"><option value="">Todas autorizadas</option>'+options(branches.map(b=>[b.id,b.name]),filters.branch_id)+'</select></label><label>Etapa<select name="status"><option value="">Todas</option>'+options(Object.entries(stages),filters.status)+'</select></label><button class="secondary">Buscar</button></form>';
}
export function lastConfirmed(events,stages){
 const e=events.filter(e=>['collect','receive','receive_direct','shipped','destination','out_for_delivery','delivered'].includes(e.action)).at(-1);
 return '<dt>Último evento físico confirmado</dt><dd>'+(e?esc((stages[e.action]??({collect:'Coleta confirmada',receive:'Recebimento confirmado',receive_direct:'Chegada direta registrada'}[e.action]))+' · '+new Date(e.at).toLocaleString('pt-BR')):'Nenhum evento registrado')+'</dd>';
}
