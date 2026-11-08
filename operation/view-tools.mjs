export function filterPage(rows,{term='',branch='',status='',page=1,size=10}={},describe=row=>String(row)){
  const needle=term.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const filtered=rows.filter(row=>(!branch||row.branch_id===branch)&&(!status||row.status===status)&&
    (!needle||describe(row).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle)));
  const pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.max(1,Math.min(page,pages));
  return {rows:filtered.slice((current-1)*size,current*size),total:filtered.length,pages,page:current};
}

// Operates only on records already returned by the authorized workspace.
export function mountListTools(container,{state={term:'',page:1},label='registros'}={}){
  const rows=Array.from(container.querySelectorAll('[data-search-row]'));
  const tools=document.createElement('div');tools.className='list-tools';
  tools.innerHTML='<label>Buscar '+label+'<input type="search" maxlength="120" data-list-search></label><div class="list-pagination"><button type="button" data-list-prev>Anterior</button><p data-list-count role="status"></p><button type="button" data-list-next>Próxima</button></div>';
  container.prepend(tools);tools.querySelector('[data-list-search]').value=state.term;
  function apply(){
    const result=filterPage(rows,state,row=>row.textContent);state.page=result.page;
    rows.forEach(row=>{row.hidden=!result.rows.includes(row);});
    tools.querySelector('[data-list-count]').textContent=result.total+' '+label+' · página '+result.page+' de '+result.pages;
    tools.querySelector('[data-list-prev]').disabled=result.page===1;
    tools.querySelector('[data-list-next]').disabled=result.page===result.pages;
  }
  tools.addEventListener('input',event=>{if(event.target.matches('[data-list-search]')){state.term=event.target.value;state.page=1;apply();}});
  tools.addEventListener('click',event=>{if(event.target.closest('[data-list-prev]'))state.page--;else if(event.target.closest('[data-list-next]'))state.page++;else return;apply();});
  apply();return state;
}

export function createNotifier(element,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let timer;
  return (message,{error=false}={})=>{
    clearTimer(timer);element.textContent=message;element.hidden=!message;
    element.dataset.kind=error?'error':'success';element.setAttribute('role',error?'alert':'status');
    if(message&&!error)timer=setTimer(()=>{element.hidden=true;},5000);
  };
}

// Keep creation fields and same-version action forms mounted during a list refresh.
export function reconcileCollectionView(root,markup){
  if(!root.ownerDocument?.createElement){root.innerHTML=markup;return;}
  const focused=root.contains(root.ownerDocument.activeElement)?root.ownerDocument.activeElement:null;
  const template=root.ownerDocument.createElement('template');template.innerHTML=markup;
  const oldTools=root.querySelector('[data-collection-tools]'),newTools=template.content.querySelector('[data-collection-tools]');
  if(oldTools&&newTools)newTools.replaceWith(oldTools);
  const forms=Array.from(root.querySelectorAll('form[data-collection]'));
  for(const fresh of template.content.querySelectorAll('form[data-collection]')){
    const old=forms.find(form=>form.dataset.collection===fresh.dataset.collection&&form.dataset.order===fresh.dataset.order&&form.dataset.version===fresh.dataset.version);
    if(old)fresh.replaceWith(old);
  }
  const openOrders=new Set(Array.from(root.querySelectorAll('[data-order-card] details[open]')).map(detail=>detail.closest('[data-order-card]').dataset.orderCard));
  for(const detail of template.content.querySelectorAll('[data-order-card] details'))if(openOrders.has(detail.closest('[data-order-card]').dataset.orderCard))detail.open=true;
  root.replaceChildren(template.content);
  if(focused?.isConnected)focused.focus({preventScroll:true});
}
