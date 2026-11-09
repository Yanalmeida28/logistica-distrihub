const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function eligiblePickupAddresses(rows,{companyId,customerId,branchId}){
  return rows.filter(row=>row.company_id===companyId&&row.customer_id===customerId&&row.branch_id===branchId&&row.active);
}
export function updatePickupSelection(form,rows,companyId,reset=false){
  if(!form?.elements?.pickup_address)return;
  let select=form.elements.pickup_address_id;
  if(!select){
    form.elements.pickup_address.closest('label').insertAdjacentHTML('beforebegin','<label>Local de coleta<select name="pickup_address_id"><option value="">Digitar endereço avulso</option></select></label><p class="fine" data-pickup-help>Cadastre locais em Gestão → Clientes → Endereços de coleta. Endereço avulso vale somente para esta OS.</p>');
    select=form.elements.pickup_address_id;
  }
  const selected=reset?'':select.value;
  const eligible=eligiblePickupAddresses(rows,{companyId,customerId:form.elements.customer_id.value,branchId:form.elements.branch_id.value});
  select.innerHTML='<option value="">Digitar endereço avulso</option>'+eligible.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.label)+'</option>').join('');
  select.value=eligible.some(row=>row.id===selected)?selected:'';
  const record=eligible.find(row=>row.id===select.value),input=form.elements.pickup_address;
  if(record){input.value=record.address;input.readOnly=true;input.dataset.savedPickup='true';}
  else{if(reset||input.dataset.savedPickup==='true')input.value='';input.readOnly=false;delete input.dataset.savedPickup;}
}
export function pickupAddressForm(row,branches,customer){
  const allowed=branches.filter(branch=>branch.active&&(!customer.branch_id||branch.id===customer.branch_id));
  return '<form data-pickup-form data-id="'+esc(row?.id??'')+'">'+(!row?'<label>Filial responsável<select name="branch_id" required>'+allowed.map(branch=>'<option value="'+esc(branch.id)+'">'+esc(branch.name)+'</option>').join('')+'</select></label>':'')+'<label>Nome do local<input name="label" required minlength="2" maxlength="80" placeholder="Ex.: Loja Centro ou Depósito" value="'+esc(row?.label??'')+'"></label><label>Endereço completo de coleta<textarea name="address" required minlength="3" maxlength="300" rows="3" placeholder="Rua, número, complemento, bairro, cidade e UF">'+esc(row?.address??'')+'</textarea></label>'+(row?'<label>Situação<select name="active"><option value="true" '+(row.active?'selected':'')+'>Ativo</option><option value="false" '+(!row.active?'selected':'')+'>Inativo</option></select></label>':'')+'<div class="overview-actions"><button>Salvar endereço</button><button type="button" data-pickup-cancel>Cancelar edição</button></div></form>';
}
export async function mountPickupAddresses(root,{request,companyId,customer,branches,run,notify,onClose,onDirty=()=>{}}){
  let rows=[],dirty=false;
  const mark=value=>{dirty=value;root.dataset.hasDraft=String(value);onDirty(value);};
  const open=row=>{if(dirty){notify('Salve ou cancele o endereço em edição antes de abrir outro.',{error:true});return;}root.querySelector('[data-pickup-editor]').innerHTML=pickupAddressForm(row,branches,customer);root.querySelector('[name="label"]').focus();};
  async function load(){
    root.innerHTML='<p role="status">Carregando endereços de coleta…</p>';
    try{
      rows=(await request('pickup-addresses',{company_id:companyId,customer_id:customer.id,action:'list'})).records;
      if(!root.isConnected)return;
      root.innerHTML='<section class="card"><h3>Endereços de coleta — '+esc(customer.name)+'</h3><p>Cada local fica vinculado a uma filial responsável. Alterar ou inativar um endereço não muda as OS já registradas.</p><div class="overview-actions">'+(customer.active?'<button type="button" data-pickup-new>Novo endereço de coleta</button>':'<p>Cliente inativo: novos locais indisponíveis.</p>')+'<button type="button" data-pickup-close>Voltar aos clientes</button></div><div data-pickup-editor></div>'+rows.map(row=>'<article class="customer-row"><strong>'+esc(row.label)+'</strong><p>'+esc(row.address)+'</p><p>'+esc(branches.find(branch=>branch.id===row.branch_id)?.name??'Filial autorizada')+' · '+(row.active?'Ativo':'Inativo')+'</p><button type="button" data-pickup-edit="'+esc(row.id)+'">Editar / inativar</button></article>').join('')+(rows.length?'':'<p>Nenhum endereço de coleta cadastrado. Use Novo endereço de coleta para cadastrar o primeiro.</p>')+'<p class="fine">Até 500 endereços autorizados nesta consulta. O cadastro principal do cliente não é alterado.</p></section>';
    }catch{if(root.isConnected)root.innerHTML='<section class="card"><p role="alert">Não foi possível carregar os endereços. Confira a conexão, as permissões e a atualização do banco.</p><button type="button" data-pickup-close>Voltar aos clientes</button></section>';}
  }
  root.addEventListener('input',event=>{if(event.target.closest('[data-pickup-form]'))mark(true);});
  root.addEventListener('change',event=>{if(event.target.closest('[data-pickup-form]'))mark(true);});
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-pickup-close],[data-pickup-cancel]')){
      if(dirty&&!confirm('Descartar as alterações deste endereço?'))return;
      mark(false);
      if(event.target.closest('[data-pickup-close]'))onClose();else root.querySelector('[data-pickup-editor]').innerHTML='';
    }
    if(event.target.closest('[data-pickup-new]'))open(null);
    const edit=event.target.closest('[data-pickup-edit]');if(edit)open(rows.find(row=>row.id===edit.dataset.pickupEdit));
  });
  root.addEventListener('submit',event=>{
    if(!event.target.matches('[data-pickup-form]'))return;event.preventDefault();event.stopPropagation();
    const form=event.target,values=Object.fromEntries(new FormData(form));
    run(async()=>{await request('pickup-addresses',{...values,company_id:companyId,customer_id:customer.id,action:form.dataset.id?'update':'create',...(form.dataset.id?{id:form.dataset.id,active:values.active==='true'}:{})});mark(false);notify('Endereço de coleta salvo.');await load();});
  });
  await load();
}
