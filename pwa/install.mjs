export function installInstructions(userAgent=''){
  if(/iPhone|iPad|iPod/i.test(userAgent))return 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Confirme em Adicionar. Se aparecer a opção, mantenha Abrir como App ativada.';
  if(/Android/i.test(userAgent))return 'No menu do Chrome, procure Instalar aplicativo ou Adicionar à tela inicial. A opção depende do navegador e pode aparecer após alguns instantes.';
  return 'No Chrome ou Edge, procure o ícone de instalação na barra de endereço ou a opção Instalar aplicativo no menu do navegador. No Safari do Mac, use Adicionar ao Dock quando disponível.';
}

export function mountInstaller({win=window,nav=navigator,doc=document}={}){
  const button=doc.querySelector('[data-pwa-install]');
  const help=doc.querySelector('[data-pwa-help]');
  if(!button||!help)return;
  let pending=null;
  const standalone=()=>win.matchMedia('(display-mode: standalone)').matches||nav.standalone===true;
  const update=()=>{button.hidden=standalone();};
  update();
  win.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event;update();});
  win.addEventListener('appinstalled',()=>{pending=null;button.hidden=true;help.close();});
  win.matchMedia('(display-mode: standalone)').addEventListener?.('change',update);
  help.querySelector('[data-pwa-close]').addEventListener('click',()=>help.close());
  button.addEventListener('click',async()=>{
    if(pending){
      const prompt=pending;pending=null;button.disabled=true;
      try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')button.hidden=true;return;}
      catch{/* Browser instructions remain available. */}
      finally{button.disabled=false;}
    }
    help.querySelector('[data-pwa-instructions]').textContent=installInstructions(nav.userAgent);
    if(!help.open)help.showModal();
  });
  if(win.isSecureContext&&'serviceWorker' in nav){
    nav.serviceWorker.register('/operacao/sw.js',{scope:'/operacao/',updateViaCache:'none'}).catch(()=>{
      // Installation availability varies by browser; never claim success on failure.
    });
  }
}

if(typeof window!=='undefined')mountInstaller();
