import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginScreen,onboardingScreen} from '../operation/access.mjs';

test('login não mistura criação de empresa com autenticação nem promete cadastro público',()=>{
  const html=loginScreen();
  assert.match(html,/id="operation-login"/);
  assert.match(html,/autocomplete="current-password"/);
  assert.match(html,/cadastro público de contas ainda não está disponível/);
  assert(!html.includes('operation-company-create'));
});

test('primeiro acesso mantém convites separados da configuração opcional do proprietário',()=>{
  const html=onboardingScreen('<img src=x onerror=alert(1)>');
  assert(!html.includes('<img'));
  assert.match(html,/&lt;img/);
  assert.match(html,/data-access-team/);
  assert.match(html,/data-access-portal/);
  assert.match(html,/<details class="access-help"><summary>Configurar minha transportadora/);
  assert.match(html,/name="branch" required/);
  assert.match(html,/Outras filiais podem ser cadastradas depois/);
  assert(!html.includes('name="role"'));
});
