export const customerDetails={person_type:2,document:20,trade_name:120,contact_name:120,email:254,phone:30,postal_code:10,street:160,address_number:20,complement:120,district:100,city:100,state:2,notes:1000};
export const customerFields='id,company_id,branch_id,name,active,'+Object.keys(customerDetails).join(',');
export function customerRecord(input){
  if(typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>120)throw Error('validation');
  const record={name:input.name.trim()};
  for(const [key,max] of Object.entries(customerDetails)){
    if(input[key]!=null&&typeof input[key]!=='string')throw Error('validation');
    const value=input[key]?.trim()||null;
    if(value&&value.length>max)throw Error('validation');
    record[key]=value;
  }
  if(record.person_type&&!['PF','PJ'].includes(record.person_type))throw Error('validation');
  if(record.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email))throw Error('validation');
  if(record.state&&!/^[A-Z]{2}$/.test(record.state))throw Error('validation');
  return record;
}
