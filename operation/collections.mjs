const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={create:'OS criada',assign:'Coleta atribuída',release:'Atribuição liberada',accept:'Coleta aceita',start:'Coleta iniciada',collect:'Coleta confirmada no cliente',receive:'Recebimento confirmado na central',pending:'Aguardando atribuição',assigned:'Atribuída',accepted:'Aceita pelo responsável',in_progress:'Coleta em andamento',collected:'Coletada no cliente',received:'Recebida na central',shipped:'Embarque confirmado',destination:'Chegada ao destino confirmada',out_for_delivery:'Saiu para entrega',delivered:'Entrega confirmada'};
const nextCargo={received:'shipped',shipped:'destination',destination:'out_for_delivery',out_for_delivery:'delivered'};
const field=(name,label,extra='')=>'<label>'+label+'<input name="'+name+'" required '+extra+'></label>';
export async function mountCollections(root,{request,companyId,membership,branchList,customers,vehicles,reload,run}){
  if(!companyId)return;
  let dirty=false,loading=false;const admin=['owner','administrative'].includes(membership?.role);
  const keys=new Map();const key=name=>{if(!keys.has(name))keys.set(name,crypto.randomUUID());return keys.get(name);};
  root.innerHTML='<section class="card"><h2>Coletas e cargas</h2><p>Carregando…</p></section>';
  async function load(){
    if(loading)return;loading=true;
    try{
      const data=(await request('collections',{company_id:companyId,action:'list'})).result;
      if(!root.isConnected||dirty)return;
      const branches=branchList.filter(b=>b.active);
      const create=admin?'<section class="card"><h2>Nova ordem de coleta</h2><form data-collection="create"><label>Filial<select name="branch_id" required>'+branches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label><label>Cliente<select name="customer_id" required>'+customers.filter(c=>c.company_id===companyId&&c.active).map(c=>'<option value="'+esc(c.id)+'" data-branch="'+esc(c.branch_id??'')+'">'+esc(c.name)+(c.branch_id?'':' · compartilhado')+'</option>').join('')+'</select></label>'+field('pickup_address','Endereço de coleta','maxlength="300" minlength="3"')+field('destination','Destino','maxlength="300" minlength="3"')+field('volumes','Quantidade de volumes','type="number" min="1" max="100000" step="1"')+field('note','Observação inicial','maxlength="500" minlength="3"')+'<button>Criar ordem de coleta</button></form></section>':'';
      const actionForm=(o,action,label,extra='')=>'<form data-collection="'+action+'" data-order="'+esc(o.id)+'" data-version="'+o.version+'">'+extra+field('note',action==='release'?'Motivo da liberação':'Observação / confirmação','minlength="3" maxlength="500"')+'<button>'+label+'</button></form>';
      root.innerHTML=create+'<section class="card"><h2>Coletas e acompanhamento</h2><p>Atualização automática a cada 15 segundos quando a aba estiver visível e sem edição pendente. Mostra até 100 ordens recentes e 1.000 eventos. Nenhuma etapa é presumida.</p><button type="button" data-refresh-collections>Atualizar lista</button><p data-collection-notice role="status"></p>'+data.orders.map(o=>{
        const cargo=data.cargos.find(c=>c.order_id===o.id),worker=data.workers.find(w=>w.id===o.assignee_id),own=o.assignee_id===membership?.id;
        let actions='';
        if(admin&&o.status==='pending'){
          const workers=data.workers.filter(w=>w.branch_id===o.branch_id),eligibleVehicles=vehicles.filter(v=>v.active&&v.branch_id===o.branch_id&&v.capacity_volumes>=o.volumes);
          actions=actionForm(o,'assign','Atribuir coleta','<label>Motorista / coletor<select name="assignee_id" required>'+workers.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.label)+' · '+(w.role==='driver'?'Motorista':'Coletor')+'</option>').join('')+'</select></label><label>Veículo<select name="vehicle_id" required>'+eligibleVehicles.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.identifier)+' · '+v.capacity_volumes+' volumes</option>').join('')+'</select></label><p>A disponibilidade é revalidada no banco. Uma coleta ativa por responsável e veículo. Capacidade em volumes; peso e cubagem ainda não são avaliados.</p>');
        }
        if(own&&['driver','collector'].includes(membership?.role)){
          const a={assigned:['accept','Aceitar coleta'],accepted:['start','Iniciar coleta'],in_progress:['collect','Confirmar coleta no cliente']}[o.status];if(a)actions+=actionForm(o,...a);
        }
        if(admin&&['assigned','accepted'].includes(o.status))actions+=actionForm(o,'release','Liberar atribuição');
        if(admin&&o.status==='collected')actions+=actionForm(o,'receive','Confirmar recebimento na central');
        if(admin&&cargo&&nextCargo[cargo.status])actions+=actionForm(o,'advance','Confirmar: '+labels[nextCargo[cargo.status]],'<input type="hidden" name="next_status" value="'+nextCargo[cargo.status]+'">');
        return '<article class="card"><h3>OS '+esc(o.id.slice(0,8))+'</h3><p><strong>'+esc(labels[cargo?.status??o.status])+'</strong> · versão '+o.version+'</p><p>'+esc(branchList.find(b=>b.id===o.branch_id)?.name??'Filial autorizada')+' · '+o.volumes+' volumes</p><p>Coleta: '+esc(o.pickup_address)+'<br>Destino: '+esc(o.destination)+'</p><p>Responsável: '+esc(worker?.label??(own?'Você':o.assignee_id?'Vinculado à OS':'A definir'))+'</p>'+actions+'<details><summary>Histórico de confirmações</summary>'+data.events.filter(e=>e.order_id===o.id).map(e=>'<p>'+esc(new Date(e.at).toLocaleString('pt-BR'))+' · '+esc(labels[e.action]??e.action)+' · '+esc(e.note)+'<br><small>Autor: '+esc(e.actor_id)+' · versão '+e.version+'</small></p>').join('')+'</details></article>';
      }).join('')+(data.orders.length?'':'<p>Nenhuma ordem acessível neste contexto.</p>')+'</section>';
      filterCustomers();
    }catch{
      if(root.isConnected){const notice=root.querySelector('[data-collection-notice]');if(notice)notice.textContent='Falha ao atualizar. Os dados exibidos podem estar desatualizados; tente novamente.';else root.innerHTML='<section class="card"><h2>Coletas indisponíveis</h2><p>Confirme a instalação da migration operacional no projeto separado. Nenhum acesso demonstrativo será usado.</p></section>';}
    }finally{loading=false;}
  }
  function filterCustomers(){const form=root.querySelector('[data-collection="create"]');if(!form)return;const branch=form.elements.branch_id.value,select=form.elements.customer_id;for(const option of select.options)option.disabled=Boolean(option.dataset.branch&&option.dataset.branch!==branch);if(select.selectedOptions[0]?.disabled)select.value=[...select.options].find(o=>!o.disabled)?.value??'';}
  root.addEventListener('input',()=>{dirty=true;});
  root.addEventListener('change',e=>{dirty=true;if(e.target.name==='branch_id')filterCustomers();});
  root.addEventListener('click',e=>{if(e.target.closest('[data-refresh-collections]'))run(async()=>{dirty=false;await load();});});
  root.addEventListener('submit',e=>{const f=e.target;if(!f.dataset.collection)return;e.preventDefault();e.stopPropagation();run(async()=>{
    const values=Object.fromEntries(new FormData(f)),action=f.dataset.collection;
    await request('collections',{...values,company_id:companyId,action,id:f.dataset.order,expected_version:Number(f.dataset.version),volumes:Number(values.volumes),request_id:key(action+':'+(f.dataset.order??'new')+':'+(f.dataset.version??''))});await reload();
  });});
  await load();
  if(globalThis.document){const poll=async()=>{if(!root.isConnected)return;if(!document.hidden&&!dirty)await load();setTimeout(poll,15000);};setTimeout(poll,15000);}
}
