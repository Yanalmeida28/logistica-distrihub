const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups=[['pending','Aguardando atribuição'],['inProgress','Coletas em andamento'],['collected','Aguardando recebimento'],['received','Recebidas na unidade'],['inTransit','Cargas em trânsito'],['delivered','Entregas confirmadas']];
const states={pending:'Aguardando atribuição',assigned:'Atribuída',accepted:'Aceita',in_progress:'Em coleta',collected:'Coletada no cliente',received:'Recebida na unidade',shipped:'Embarcada',destination:'Na unidade de destino',out_for_delivery:'Saiu para entrega',delivered:'Entrega confirmada'};

export function summarizeOperations(data,companyId,branch=''){
  const orders=[...new Map(data.orders.filter(order=>order.company_id===companyId&&(!branch||order.branch_id===branch)).map(order=>[order.id,order])).values()];
  const counters={pending:0,inProgress:0,collected:0,received:0,inTransit:0,delivered:0,other:0};
  const rows=orders.map(order=>{
    const cargo=data.cargos.find(item=>item.order_id===order.id&&item.company_id===companyId&&item.branch_id===order.branch_id);
    const status=cargo?.status??order.status;
    const group=status==='pending'?'pending':['assigned','accepted','in_progress'].includes(status)?'inProgress':status==='collected'?'collected':status==='received'?'received':['shipped','destination','out_for_delivery'].includes(status)?'inTransit':status==='delivered'?'delivered':'other';
    counters[group]++;return {...order,displayStatus:status};
  });
  return {counters,rows,total:rows.length};
}

export async function mountOverview(root,{request,companyId,membership,branchList,onNavigate}){
  if(!companyId)return;
  if(!['owner','administrative','driver','collector'].includes(membership?.role)){
    root.innerHTML='<section class="card"><h2>Acompanhe suas cargas</h2><p>Consulte as cargas e os documentos que a transportadora compartilhou com você.</p><button type="button" class="primary" data-overview-portal>Abrir portal e documentos</button></section>';
    root.addEventListener('click',event=>{if(event.target.closest('[data-overview-portal]'))onNavigate('relations');});return;
  }
  const admin=['owner','administrative'].includes(membership.role);
  let snapshot=null,branch='',loading=false,updated='';
  root.innerHTML='<section class="card"><h2>Resumo da operação</h2><label>Filial do resumo<select data-overview-branch><option value="">Todas as autorizadas</option>'+branchList.filter(item=>item.active).map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('')+'</select></label><div class="overview-actions"><button type="button" class="secondary" data-overview-refresh>Atualizar resumo</button><button type="button" class="primary" data-overview-collections>Abrir coletas e cargas</button></div><p data-overview-status role="status">Carregando dados da operação…</p><div data-overview-body></div></section>';
  const body=root.querySelector('[data-overview-body]'),status=root.querySelector('[data-overview-status]');
  function paint(){
    if(!snapshot)return;
    const {counters,rows,total}=summarizeOperations(snapshot,companyId,branch);
    const attention=rows.filter(row=>admin?['pending','collected'].includes(row.displayStatus):['assigned','accepted','in_progress'].includes(row.displayStatus)).slice(0,5);
    const max=Math.max(1,...groups.map(([key])=>counters[key]));
    body.innerHTML='<div class="overview-metrics">'+groups.map(([key,label])=>'<article class="overview-metric '+key+'"><span>'+label+'</span><strong>'+counters[key]+'</strong></article>').join('')+'</div><div class="overview-columns"><section><h3>Distribuição das etapas</h3>'+groups.map(([key,label])=>'<label class="overview-bar">'+label+'<span>'+counters[key]+'</span><meter min="0" max="'+max+'" value="'+counters[key]+'">'+counters[key]+'</meter></label>').join('')+'</section><section><h3>'+ (admin?'Prioridades da central':'Suas próximas coletas')+'</h3>'+attention.map(order=>'<article class="overview-attention"><strong>OS '+esc(order.id.slice(0,8))+'</strong><span>'+esc(states[order.displayStatus]??'Etapa não classificada')+'</span><p>'+esc(branchList.find(item=>item.id===order.branch_id)?.name??'Filial autorizada')+' · '+esc(order.volumes)+' volumes</p></article>').join('')+(attention.length?'':'<p>Nenhuma pendência dessas etapas entre os registros carregados.</p>')+'</section></div><p class="fine">'+total+' ordens nesta seleção. Resumo das até 100 ordens recentes devolvidas pelo servidor, limitado ao seu acesso. Não representa todo o histórico nem uma posição financeira.'+(counters.other?' Há '+counters.other+' registros com etapa não classificada.':'')+'</p>';
    status.textContent='Atualizado às '+updated+'.';
  }
  async function load(){
    if(loading)return;loading=true;
    const refresh=root.querySelector('[data-overview-refresh]');refresh.disabled=true;
    try{
      const data=(await request('collections',{company_id:companyId,action:'list'})).result;
      if(!root.isConnected)return;
      if(!data||!Array.isArray(data.orders)||!Array.isArray(data.cargos))throw Error('invalid');
      snapshot=data;updated=new Date().toLocaleTimeString('pt-BR');paint();
    }catch(error){if(root.isConnected){if(error.status===401||error.status===403){snapshot=null;body.innerHTML='';}status.textContent=snapshot?'Falha ao atualizar. O resumo anterior pode estar desatualizado; tente novamente.':'Resumo indisponível. Confira sua conexão e suas permissões.';}}
    finally{loading=false;if(root.isConnected)refresh.disabled=false;}
  }
  root.addEventListener('change',event=>{if(event.target.matches('[data-overview-branch]')){branch=event.target.value;paint();}});
  root.addEventListener('click',event=>{if(event.target.closest('[data-overview-refresh]'))void load();if(event.target.closest('[data-overview-collections]'))onNavigate('collections');});
  await load();
  if(globalThis.document){const poll=async()=>{if(!root.isConnected)return;if(!document.hidden&&!root.closest('[data-operation-panel]')?.hidden)await load();setTimeout(poll,30000);};setTimeout(poll,30000);}
}
