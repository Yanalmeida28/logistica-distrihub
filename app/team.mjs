import {createEmployee,requestCollection,confirmCollection,demoCompany,branches} from './domain.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unit=id=>id==='unidade-a'?'Unidade A':'Unidade B';
let employees=[
  createEmployee({id:'admin-a',name:'Central exemplo A',companyId:demoCompany,branchId:'unidade-a',role:'administrative'}),
  createEmployee({id:'admin-b',name:'Central exemplo B',companyId:demoCompany,branchId:'unidade-b',role:'administrative'}),
  createEmployee({id:'collector-a',name:'Coletor exemplo A',companyId:demoCompany,branchId:'unidade-a',role:'collector'}),
  createEmployee({id:'driver-a1',name:'Motorista exemplo A1',companyId:demoCompany,branchId:'unidade-a',role:'driver'}),
  createEmployee({id:'driver-a2',name:'Motorista exemplo A2',companyId:demoCompany,branchId:'unidade-a',role:'driver'}),
  createEmployee({id:'driver-b1',name:'Motorista exemplo B1',companyId:demoCompany,branchId:'unidade-b',role:'driver'}),
  createEmployee({id:'collector-b',name:'Coletor exemplo B',companyId:demoCompany,branchId:'unidade-b',role:'collector'}),
];
let selectedCollector='collector-a';
export function demoEmployees(){return employees.map(e=>({...e}));}
function input(name,title,type='text',max=100){return '<label>'+title+'<input name="'+name+'" type="'+type+'" required maxlength="'+max+'"'+(type==='number'?' min="1" max="100000" step="1" value="1"':'')+'></label>';}
export function mountTeam(root,{branch,getCargo,saveCargo,notify}) {
  const scoped=employees.filter(e=>e.companyId===demoCompany&&(branch==='all'||e.branchId===branch));
  const collectors=scoped.filter(e=>e.role==='collector'&&e.active),admins=scoped.filter(e=>e.role==='administrative'&&e.active);
  if (!collectors.some(e=>e.id===selectedCollector))selectedCollector=collectors[0]?.id??'';
  const rows=getCargo().filter(c=>c.companyId===demoCompany&&c.collectorId&&(branch==='all'||c.branchId===branch));
  const collector=collectors.find(e=>e.id===selectedCollector);
  const assigned=rows.filter(c=>c.collectorId===selectedCollector);
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">EQUIPE / COLETA / CENTRAL</p><h1>Cada confirmação tem um responsável.</h1><p>Simulação de funções. Não há login ou sincronização entre aparelhos.</p></div></div>'+
    '<div class="tip horizontal"><strong>Como testar</strong><p>1. A central atribui uma coleta. 2. Selecione o coletor do exemplo e confirme. 3. A lista da central muda nesta mesma página. Coletada não significa recebida no armazém.</p></div>'+
    '<div class="cards-two team-panels"><section class="card"><h2>Cadastro demonstrativo da equipe</h2><form id="employee-form"><div class="form-grid">'+input('name','Nome fictício','text',80)+'<label>Função<select name="role"><option value="collector">Coleta</option><option value="driver">Motorista</option><option value="administrative">Administrativo / central</option></select></label><label>Unidade<select name="branchId">'+branches.filter(b=>branch==='all'||b===branch).map(b=>'<option value="'+b+'">'+unit(b)+'</option>').join('')+'</select></label></div><button class="secondary" type="submit">Adicionar funcionário de teste</button></form><div class="team-list">'+scoped.map(e=>'<div><strong>'+esc(e.name)+'</strong><small>'+({collector:'Coleta',driver:'Motorista',administrative:'Administrativo'}[e.role])+' · '+unit(e.branchId)+' · '+(e.active?'Ativo':'Inativo')+'</small><button class="text-button" type="button" data-toggle="'+esc(e.id)+'">'+(e.active?'Desativar':'Ativar')+' · teste</button></div>').join('')+'</div></section>'+
    '<section class="card"><h2>Administrativo: atribuir coleta</h2><form id="collection-form"><div class="form-grid"><label>Responsável administrativo<select name="administratorId" required>'+admins.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+' · '+unit(e.branchId)+'</option>').join('')+'</select></label><label>Coletor<select name="collectorId" required>'+collectors.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+' · '+unit(e.branchId)+'</option>').join('')+'</select></label>'+input('customer','Cliente fictício')+input('origin','Origem fictícia')+input('destination','Destino fictício')+input('volumes','Volumes previstos','number')+'<label class="wide">Descrição fictícia<textarea name="description" required maxlength="300"></textarea></label></div><p class="fine">Selecione administrativo e coletor da mesma unidade. Nada será enviado ao celular.</p><button class="primary" type="submit"'+(!admins.length||!collectors.length?' disabled':'')+'>Atribuir coleta de teste</button></form></section></div>'+
    '<section class="card collector-area"><div class="section-title"><h2>Área do coletor — simulação</h2><span class="badge">Sem autenticação real</span></div><label>Simular o acesso de<select id="collector-selector">'+collectors.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===selectedCollector?' selected':'')+'>'+esc(e.name)+' · '+unit(e.branchId)+'</option>').join('')+'</select></label><p class="fine">Nesta área são exibidas somente as coletas atribuídas ao funcionário escolhido. Isso é uma simulação visual, não autorização de produção.</p>'+
    assigned.map(c=>'<article class="mini-card"><strong>'+esc(c.code)+' · '+esc(c.customer)+'</strong><p>'+esc(c.origin)+' → '+esc(c.destination)+' · '+c.volumes+' volumes</p><span class="status">'+(c.status==='collection_requested'?'Aguardando confirmação da coleta':c.status==='collected'?'Coletada na origem — central atualizada no exemplo':'Etapa posterior à coleta')+'</span>'+(c.status==='collection_requested'?'<form data-confirm="'+esc(c.id)+'"><label>Confirmação da coleta<textarea name="note" maxlength="300" required placeholder="Ex.: Recebi os volumes na origem e conferi a quantidade. Use somente informações fictícias."></textarea></label><button class="primary" type="submit">Confirmar carga coletada · teste</button></form>':'')+'</article>').join('')+(assigned.length?'':'<div class="empty">Nenhuma coleta atribuída a este coletor neste contexto.</div>')+'</section>'+
    '<div class="section-title"><h2>Central: acompanhamento das coletas</h2><span>Atualização em memória</span></div><div class="table-wrap"><table><thead><tr><th>Carga</th><th>Coletor / unidade</th><th>Situação</th><th>Última confirmação</th></tr></thead><tbody>'+rows.map(c=>{const actor=employees.find(e=>e.id===c.collectorId),last=c.events.at(-1);return '<tr><td><strong>'+esc(c.code)+'</strong><small>'+esc(c.customer)+'</small></td><td>'+esc(actor?.name??'Funcionário indisponível')+'<small>'+unit(c.branchId)+'</small></td><td><span class="status">'+(c.status==='collection_requested'?'Coleta atribuída':c.status==='collected'?'Coletada na origem':'Recebimento ou movimentação posterior')+'</span></td><td>'+esc(last.actor)+'<small>'+esc(new Date(last.at).toLocaleString('pt-BR'))+'</small></td></tr>';}).join('')+'</tbody></table>'+(rows.length?'':'<p class="empty">Atribua a primeira coleta de exemplo.</p>')+'</div><p class="form-error" role="alert" id="team-error"></p>';
  function repaint(){mountTeam(root,{branch,getCargo,saveCargo,notify});}
  function error(e){root.querySelector('#team-error').textContent=e.message;root.querySelector('#team-error').scrollIntoView({block:'nearest'});}
  root.querySelector('#collector-selector').addEventListener('change',e=>{selectedCollector=e.target.value;repaint();});
  root.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',()=>{employees=employees.map(e=>e.id===b.dataset.toggle?{...e,active:!e.active}:e);repaint();}));
  root.querySelectorAll('form').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();e.stopPropagation();const values=Object.fromEntries(new FormData(form));
    try {
      if(form.id==='employee-form')employees=[...employees,createEmployee({...values,id:crypto.randomUUID(),companyId:demoCompany})];
      else if(form.id==='collection-form'){
        const administrator=employees.find(e=>e.id===values.administratorId),assignedCollector=employees.find(e=>e.id===values.collectorId),id=crypto.randomUUID();
        const c=requestCollection({...values,id,code:'COL-'+id.slice(0,8).toUpperCase(),companyId:demoCompany,branchId:administrator?.branchId,at:new Date().toISOString()},administrator,assignedCollector);
        saveCargo([c,...getCargo()]);selectedCollector=assignedCollector.id;
      }else if(form.dataset.confirm){
        const c=getCargo().find(c=>c.id===form.dataset.confirm);
        const next=confirmCollection(c,{companyId:demoCompany,branchId:branch,at:new Date().toISOString(),note:values.note},collector);
        saveCargo(getCargo().map(c=>c.id===next.id?next:c));
      }
      repaint();notify('Exemplo atualizado na mesma página. Sem sincronização real.');
    }catch(e){error(e);}
  }));
}
