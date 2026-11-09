// Presentation filters only. The existing server remains the source of authorization.
export function operationalRows(data,companyId){
  return [...new Map(data.orders.filter(o=>o.company_id===companyId).map(o=>[o.id,o])).values()].map(order=>{
    const cargo=data.cargos.find(c=>c.company_id===companyId&&c.branch_id===order.branch_id&&c.order_id===order.id);
    return {...order,status:cargo?.status??order.status};
  });
}
export function taskRows(data,companyId,task,membership){
  const rows=operationalRows(data,companyId);
  if(['driver','collector'].includes(membership?.role))return task==='collections'?rows.filter(o=>o.assignee_id===membership.id):[];
  if(!['owner','administrative','manager'].includes(membership?.role))return [];
  const stages={collections:['pending','assigned','accepted','in_progress'],receiving:['collected'],cargos:['received','shipped','destination','out_for_delivery','delivered'],pending:['pending','collected']}[task];
  return stages?rows.filter(o=>stages.includes(o.status)):[];
}
