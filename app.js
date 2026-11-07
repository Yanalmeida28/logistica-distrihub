'use strict';
const events = [
  ['Coleta confirmada', 'A mercadoria foi coletada na origem. Isso não confirma recebimento na unidade ou embarque em uma viagem.', 'Confirmação de coleta pela equipe responsável ou por integração validada.'],
  ['Recebimento na unidade', 'A mercadoria foi recebida. Falta confirmar documentação e embarque; recebimento não significa que a carga já está em viagem.', 'Registro da equipe da unidade, com horário, volumes e responsável.'],
  ['Embarque confirmado', 'A carga foi vinculada ao embarque. Horários e previsões dependem do que foi confirmado pela operação.', 'Conferência de volumes e confirmação da operação. Nunca inferir embarque a partir da coleta.'],
  ['Chegada à unidade de destino', 'A carga chegou ao destino operacional. Ainda pode haver separação ou pendências antes da saída para entrega.', 'Recebimento pela unidade de destino, com volumes e registro de divergências.'],
  ['Saída para entrega', 'A carga saiu para entrega. Isso não garante recebimento pelo destinatário nem transforma previsão em compromisso.', 'Confirmação de saída pela operação e registro de ocorrências quando necessário.'],
  ['Entrega confirmada', 'Neste exemplo, a entrega foi confirmada. Entregas parciais, recusas e avarias precisam de tratamento específico.', 'Confirmação autorizada e evidência da entrega; exceções encaminhadas ao atendimento humano.'],
];
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  const step = Number(button.dataset.step);
  if (!Number.isInteger(step) || !events[step]) return;
  document.querySelectorAll('[data-step]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  document.getElementById('event-number').textContent = String(step + 1).padStart(2, '0');
  document.getElementById('event-title').textContent = events[step][0];
  document.getElementById('event-description').textContent = events[step][1];
  document.getElementById('event-source').textContent = events[step][2];
}));
