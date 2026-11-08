export const logisticsOrigin='https://logistica.distrihub.com.br';

export function hostingSettings(env=process.env){
  const publicOrigin=env.LOGISTICS_PUBLIC_ORIGIN||null;
  if(publicOrigin&&publicOrigin!==logisticsOrigin)throw Error('Dominio de hospedagem nao autorizado.');
  const port=Number(env.PORT||4180);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Porta de hospedagem invalida.');
  return {publicOrigin,port,host:publicOrigin?'0.0.0.0':'127.0.0.1'};
}
