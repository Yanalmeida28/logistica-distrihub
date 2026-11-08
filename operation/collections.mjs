import {filterPage,reconcileCollectionView} from './view-tools.mjs';
import {shareCollectionPdf} from './order-pdf.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={create:'OS criada',assign:'Coleta atribuída',release:'Atribuição liberada',accept:'Coleta aceita',start:'Coleta iniciada',collect:'Coleta confirmada no cliente',receive:'Recebimento confirmado na central',pending:'Aguardando atribuição',assigned:'Atribuída',accepted:'Aceita pelo responsável',in_progress:'Coleta em andamento',collected:'Coletada no cliente',received:'Recebida na central',shipped:'Embarque confirmado',destination:'Chegada ao destino confirmada',out_for_delivery:'Saiu para entrega',delivered:'Entrega confirmada'};
const nextCargo={received:'shipped',shipped:'destination',destination:'out_for_delivery',out_for_delivery:'delivered'};
const field=(name,label,extra='')=>'<label>'+label+'<input name="'+name+'" required '+extra+'></label>';
export async function mountCollections(root,{request,companyId,membership,branchList,customers,vehicles,reload,run,notify=()=>{},companyName='Transportadora'}){
  if(!companyId)return;
  let dirty=false,loading=false,lastData=null,lastSnapshot='';const filters={term:'',branch:'',status:'',page:1};const admin=['owner','administrative'].includes(membership?.role);
  const keys=new Map();const key=name=>{if(!keys.has(name))keys.set(name,crypto.randomUUID());return keys.get(name);};
  root.innerHTML='<section class="card"><h2>Coletas e cargas</h2><p>Carregando…</p></section>';
  async function load(fromCache=false){
    if(loading)return;loading=true;
    try{
      const data=fromCache?lastData:(await request('collections',{company_id:companyId,action:'list'})).result;
      if(!data)return;
      const snapshot=JSON.stringify(data);
      if(!fromCache&&snapshot===lastSnapshot)return;
      if(!root.isConnected||(!fromCache&&dirty))return;
      lastData=data;lastSnapshot=snapshot;
      const page=filterPage(data.orders.map(order=>({...order,status:data.cargos.find(c=>c.order_id===order.id)?.status??order.status})),filters,order=>[order.id,order.pickup_address,order.destination,customers.find(c=>c.id===order.customer_id)?.name??''].join(' '));filters.page=page.page;
      const branches=branchList.filter(b=>b.active);
      const create=admin?'<section class="card"><h2>Nova ordem de coleta</h2><form data-collection="create"><label>Filial<select name="branch_id" required>'+branches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label><label>Cliente<select name="customer_id" required>'+customers.filter(c=>c.company_id===companyId&&c.active).map(c=>'<option value="'+esc(c.id)+'" data-branch="'+esc(c.branch_id??'')+'">'+esc(c.name)+(c.branch_id?'':' · compartilhado')+'</option>').join('')+'</select></label>'+field('pickup_address','Endereço de coleta','maxlength="300" minlength="3"')+field('destination','Destino','maxlength="300" minlength="3"')+field('volumes','Quantidade de volumes','type="number" min="1" max="100000" step="1"')+field('note','Observação inicial','maxlength="500" minlength="3"')+'<button>Criar ordem de coleta</button></form></section>':'';
      const actionForm=(o,action,label,extra='')=>'<form data-collection="'+action+'" data-order="'+esc(o.id)+'" data-version="'+o.version+'">'+extra+field('note',action==='release'?'Motivo da liberação':'Observação / confirmação','minlength="3" maxlength="500"')+'<button>'+label+'</button></form>';
      const markup=create+'<section class="card"><h2>Coletas e acompanhamento</h2><p>Atualização automática a cada 15 segundos quando a aba estiver visível e sem edição pendente. Mostra até 100 ordens recentes e 1.000 eventos. Nenhuma etapa é presumida.</p><button type="button" data-refresh-collections>Atualizar lista</button><p data-collection-notice role="status"></p>'+'<div class="collection-tools" data-collection-tools><label>Buscar ordem<input type="search" data-collection-search maxlength="120"></label><label>Filial<select data-collection-branch><option value="">Todas as autorizadas</option>'+branches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label><label>Etapa<select data-collection-status><option value="">Todas</option>'+['pending','assigned','accepted','in_progress','collected','received','shipped','destination','out_for_delivery','delivered'].map(state=>'<option value="'+state+'">'+labels[state]+'</option>').join('')+'</select></label></div><div class="list-pagination"><button type="button" data-collection-prev>Anterior</button><p data-collection-page role="status"></p><button type="button" data-collection-next>Próxima</button></div>'+page.rows.map(o=>{
        o=data.orders.find(order=>order.id===o.id);const cargo=data.cargos.find(c=>c.order_id===o.id),worker=data.workers.find(w=>w.id===o.assignee_id),own=o.assignee_id===membership?.id;
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
        return '<article class="card" data-order-card="'+esc(o.id)+'"><h3>OS '+esc(o.id.slice(0,8))+'</h3><p><strong>'+esc(labels[cargo?.status??o.status])+'</strong> · versão '+o.version+'</p><p>'+esc(branchList.find(b=>b.id===o.branch_id)?.name??'Filial autorizada')+' · '+o.volumes+' volumes</p><p>Coleta: '+esc(o.pickup_address)+'<br>Destino: '+esc(o.destination)+'</p><p>Responsável: '+esc(worker?.label??(own?'Você':o.assignee_id?'Vinculado à OS':'A definir'))+'</p>'+'<button type="button" data-collection-pdf="'+esc(o.id)+'">Compartilhar / baixar PDF da OS</button>'+actions+'<details><summary>Histórico de confirmações</summary>'+data.events.filter(e=>e.order_id===o.id).map(e=>'<p>'+esc(new Date(e.at).toLocaleString('pt-BR'))+' · '+esc(labels[e.action]??e.action)+' · '+esc(e.note)+'<br><small>Autor: '+esc(e.actor_id)+' · versão '+e.version+'</small></p>').join('')+'</details></article>';
      }).join('')+(page.total?'':'<p>Nenhuma ordem acessível neste contexto.</p>')+'</section>';
      reconcileCollectionView(root,markup);
      const count=root.querySelector('[data-collection-page]');if(count){count.textContent=page.total+' ordens nesta seleção · página '+page.page+' de '+page.pages;root.querySelector('[data-collection-prev]').disabled=page.page===1;root.querySelector('[data-collection-next]').disabled=page.page===page.pages;}
      filterCustomers();
    }catch{
      if(root.isConnected){const notice=root.querySelector('[data-collection-notice]');if(notice)notice.textContent='Falha ao atualizar. Os dados exibidos podem estar desatualizados; tente novamente.';else root.innerHTML='<section class="card"><h2>Coletas indisponíveis</h2><p>Confirme a instalação da migration operacional no projeto separado. Nenhum acesso demonstrativo será usado.</p></section>';}
    }finally{loading=false;}
  }
  function filterCustomers(){const form=root.querySelector('[data-collection="create"]');if(!form)return;const branch=form.elements.branch_id.value,select=form.elements.customer_id;for(const option of select.options)option.disabled=Boolean(option.dataset.branch&&option.dataset.branch!==branch);if(select.selectedOptions[0]?.disabled)select.value=[...select.options].find(o=>!o.disabled)?.value??'';}
  root.addEventListener('input',e=>{if(e.target.matches('[data-collection-search]')){if(dirty){e.target.value=filters.term;notify('Finalize a edição antes de filtrar.',{error:true});return;}filters.term=e.target.value;filters.page=1;void load(true);}else if(e.target.closest('form')){dirty=true;if(root.dataset)root.dataset.hasDraft='true';}});
  root.addEventListener('change',e=>{if(dirty&&e.target.matches('[data-collection-branch],[data-collection-status]')){e.target.value=e.target.matches('[data-collection-branch]')?filters.branch:filters.status;notify('Finalize a edição antes de filtrar.',{error:true});return;}if(e.target.matches('[data-collection-branch]')){filters.branch=e.target.value;filters.page=1;void load(true);}else if(e.target.matches('[data-collection-status]')){filters.status=e.target.value;filters.page=1;void load(true);}else{dirty=true;if(root.dataset)root.dataset.hasDraft='true';if(e.target.name==='branch_id')filterCustomers();}});
  root.addEventListener('click',e=>{
    if(dirty&&e.target.closest('[data-collection-prev],[data-collection-next]')){notify('Finalize a edição antes de trocar de página.',{error:true});return;}
    if(e.target.closest('[data-refresh-collections]')){if(dirty)notify('Finalize a edição antes de atualizar a lista.',{error:true});else run(()=>load());}
    if(e.target.closest('[data-collection-prev]')){filters.page--;void load(true);}
    if(e.target.closest('[data-collection-next]')){filters.page++;void load(true);}
    const pdf=e.target.closest('[data-collection-pdf]');if(pdf){const order=lastData?.orders.find(o=>o.id===pdf.dataset.collectionPdf);if(!order)return;run(async()=>{const result=await shareCollectionPdf(order,{companyId,companyName,branchName:branchList.find(b=>b.id===order.branch_id)?.name,customerName:customers.find(c=>c.id===order.customer_id&&c.company_id===companyId)?.name});if(result!=='cancelled')notify(result==='shared'?'PDF encaminhado ao aplicativo escolhido.':'PDF da ordem baixado.');});}
  });
  root.addEventListener('submit',e=>{const f=e.target;if(!f.dataset.collection)return;e.preventDefault();e.stopPropagation();run(async()=>{
    const values=Object.fromEntries(new FormData(f)),action=f.dataset.collection;
    await request('collections',{...values,company_id:companyId,action,id:f.dataset.order,expected_version:Number(f.dataset.version),volumes:Number(values.volumes),request_id:key(action+':'+(f.dataset.order??'new')+':'+(f.dataset.version??''))});keys.delete(action+':'+(f.dataset.order??'new')+':'+(f.dataset.version??''));f.reset();dirty=false;if(root.dataset)delete root.dataset.hasDraft;lastSnapshot='';notify(labels[action]??'Atualização salva.');await load();
  });});
  await load();
  if(globalThis.document){const poll=async()=>{if(!root.isConnected)return;if(!document.hidden&&!root.hidden&&!dirty)await load();setTimeout(poll,15000);};setTimeout(poll,15000);}
}
