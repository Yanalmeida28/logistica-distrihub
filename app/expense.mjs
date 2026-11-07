import {updateExpense,attachReceipt} from './expense-domain.mjs';
import {localDay} from './finance-domain.mjs';
import {demoEmployees} from './team.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountExpense(root,{account,actor,save,notify}){
  if(account?.type!=='expense')return;
  const box=document.createElement('section');box.className='card';box.id='expense-costs';
  const d=account.costDetails??{},drivers=demoEmployees().filter(e=>e.role==='driver'&&e.active&&e.companyId===account.companyId&&e.branchId===account.branchId);
  const field=(name,label,type='text',attrs='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(d[name]??(name==='date'?localDay():''))+'" '+attrs+'></label>';
  const disabled=account.status==='cancelled';
  box.innerHTML='<h2>Custos operacionais e comprovantes</h2><p>Vínculo demonstrativo a motorista, veículo e viagem/OS. Anexos ficam somente na memória desta página e desaparecem ao recarregar. Use apenas arquivos fictícios.</p>'+
    '<form id="expense-details"><fieldset '+(disabled?'disabled':'')+'><div class="form-grid"><label>Motorista da unidade<select name="driverId"><option value="">Sem vínculo</option>'+drivers.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===d.driverId?'selected':'')+'>'+esc(e.name)+'</option>').join('')+'</select></label>'+field('vehicle','Veículo fictício','text','maxlength="80"')+field('reference','Referência da viagem / OS fictícia','text','maxlength="120"')+field('document','Número do documento fictício','text','maxlength="80"')+field('date','Data da despesa','date','required max="'+localDay()+'"')+field('odometer','Quilometragem (opcional)','number','min="0" max="10000000" step="any"')+(account.category==='fuel'?field('liters','Litros (opcional)','number','min="0" max="10000000" step="any"'):'')+'<label class="wide">Observação fictícia<textarea name="note" maxlength="300">'+esc(d.note)+'</textarea></label></div><button class="secondary">Salvar detalhes · teste</button></fieldset></form>'+
    '<h3>Comprovantes ('+(account.receipts??[]).length+'/5)</h3><form id="expense-receipt"><label>PDF, JPG ou PNG fictício · até 5 MB<input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" required '+(disabled?'disabled':'')+'></label><button class="secondary" '+(disabled?'disabled':'')+'>Anexar somente neste teste</button></form><p class="fine">Anexar não registra pagamento, não valida autenticidade fiscal e não envia arquivo a servidor. Não há antivírus ou armazenamento durável. Referência de OS é texto livre, sem vínculo validado.</p>'+
    (account.receipts??[]).map(r=>'<p>'+esc(r.name)+' · '+Math.ceil(r.bytes.length/1024)+' KB · '+r.date+' <button type="button" class="text-button" data-receipt="'+esc(r.id)+'">Baixar cópia</button></p>').join('')+'<p role="alert" class="form-error" id="expense-error"></p>';
  root.querySelector('#account-detail').append(box);
  const error=e=>box.querySelector('#expense-error').textContent=e.message;
  box.querySelector('#expense-details').addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();try{save(updateExpense(account,Object.fromEntries(new FormData(e.target)),actor,demoEmployees()));notify('Detalhes salvos somente no exemplo.');}catch(e){error(e);}});
  box.querySelector('#expense-receipt').addEventListener('submit',async e=>{e.preventDefault();e.stopPropagation();const button=e.target.querySelector('button');button.disabled=true;try{
    const file=e.target.elements.receipt.files[0];if(!file||file.size>5*1024*1024)throw new Error('Escolha um arquivo fictício de até 5 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!box.isConnected)return;
    save(attachReceipt(account,{id:crypto.randomUUID(),name:file.name,mime:file.type,bytes},actor));notify('Comprovante mantido só na memória; pagamento não alterado.');
  }catch(e){error(e);}finally{button.disabled=false;}});
  box.querySelectorAll('[data-receipt]').forEach(b=>b.addEventListener('click',()=>{const r=account.receipts.find(r=>r.id===b.dataset.receipt),url=URL.createObjectURL(new Blob([r.bytes],{type:r.mime})),a=document.createElement('a');a.href=url;a.download=r.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
}
