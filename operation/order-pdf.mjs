// Adapted from the ERP quote renderer: pagination, standalone PDF and native sharing.
export function buildCollectionPdf(order,{companyId,companyName,branchName,customerName}={},Pdf=globalThis.jspdf?.jsPDF){
  if(!Pdf)throw Error('Gerador de PDF indisponível. Recarregue a página.');
  if(!order||order.company_id!==companyId)throw Error('Ordem fora da empresa selecionada.');
  const doc=new Pdf({unit:'mm',format:'a4',compress:true});let y=20;
  const text=value=>{for(const line of doc.splitTextToSize(Array.from(String(value??''),c=>c.charCodeAt(0)<32?' ':c).join(''),180)){
    if(y>275){doc.addPage();y=20;}doc.text(line,15,y);y+=6;
  }};
  text('DistriHub Logística — ORDEM DE COLETA');text(companyName);text('Filial: '+branchName);
  text('OS: '+order.id);text('Cliente: '+(customerName||'Cliente vinculado'));
  text('Endereço de coleta: '+order.pickup_address);text('Destino: '+order.destination);text('Volumes: '+order.volumes);
  text('Documento operacional. Não é CT-e, MDF-e, comprovante de coleta ou autorização fiscal de transporte.');
  return {pdf:doc,filename:'ordem-coleta-'+String(order.id).replace(/[^a-zA-Z0-9-]/g,'')+'.pdf'};
}

export async function shareCollectionPdf(order,details){
  const {pdf,filename}=buildCollectionPdf(order,details);
  if(globalThis.navigator?.share&&globalThis.navigator?.canShare&&globalThis.File){
    const file=new File([pdf.output('blob')],filename,{type:'application/pdf'});
    let supported=false;try{supported=navigator.canShare({files:[file]});}catch{/* Download remains available. */}
    if(supported){
      try{await navigator.share({files:[file],title:'Ordem de coleta'});return 'shared';}
      catch(error){if(error.name==='AbortError')return 'cancelled';if(!['NotAllowedError','NotSupportedError','SecurityError'].includes(error.name))throw error;}
    }
  }
  await pdf.save(filename,{returnPromise:true});return 'downloaded';
}
