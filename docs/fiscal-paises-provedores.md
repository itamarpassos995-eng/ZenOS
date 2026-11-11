# Fiscal por país e provedor — configuração e limites

Esta entrega implementa a escolha e persistência da integração no autoatendimento fiscal. Não libera emissão em produção, cobrança, transmissão de cadastros nem upload de credenciais para novos provedores.

## Cadastro e compatibilidade

- A empresa escolhe Brasil ou Paraguai, mantendo a estrutura por país.
- Integração padrão ZenOS: resolve Focus NFe para BR e Sifende para PY no servidor. É uma preferência, não contratação nem promessa de emissão homologada.
- Conta própria: Focus NFe (BR); Sifende ou solicitação de integração Kuota (PY).
- O catálogo compartilhado é local, sem consultas ao banco. `estado` descreve o estágio do conector no ZenOS, não a disponibilidade comercial do fornecedor.
- PY permite solicitar factura, nota de crédito, nota de débito e nota de remisión. Solicitar cobertura não altera os tipos executáveis do gateway atual, nem a trava conservadora de uma factura por venda. Crédito e remisión precisarão de identidade própria por ajuste/expedição; não devem reutilizar a identidade da factura.
- Todos continuam com `emissaoHabilitada: false`. Cadastros legados não são migrados por leitura. Mudanças em configurações ativas continuam bloqueadas.
- A escolha entra no fingerprint; alterar país/provedor/documentos invalida a validação anterior. Repetir um salvamento idêntico não escreve nem apaga validações/credenciais existentes.
- A interface exige versão 2 do serviço para enviar a nova configuração; um backend antigo não descarta silenciosamente a escolha.

## Leituras

| Ação | Comportamento |
| --- | --- |
| Abrir o cadastro fiscal | Uma consulta de configuração, compartilhada entre montagens simultâneas |
| Reabrir em até 60 segundos | Cache em memória, isolado por usuário autenticado e loja |
| Trocar país, provedor, documentos ou etapa | Zero consultas Firestore |
| Atualizar status explicitamente | Uma consulta, ignora cache |
| Salvar configuração | Uma leitura de configuração na transação; no máximo uma escrita |
| Salvar conteúdo idêntico | Uma leitura de configuração; zero escritas |
| Logout/contexto diferente | Chave de cache diferente; nunca compartilha respostas entre usuários/lojas |

Os números de backend acima excluem a autorização preexistente da loja. Os testes do handler usam Firestore e autorização simulados; não representam medição de cobrança em produção. Não foram adicionados listeners, timers de consulta, novas coleções ou varreduras de históricos.

## Próximas etapas de emissão, logística e auditoria

1. Homologar cada combinação país/provedor/documento com credenciais de teste e retorno oficial verificado. Não ativar um tipo porque outro foi homologado.
2. Criar expedições independentes da venda, com itens e quantidades por entrega parcial; destinatário, motivo, origem/destino, datas e transporte. Conferir os requisitos com o contador e as regras DNIT aplicáveis à empresa.
3. Ligar crédito/débito ao documento original da mesma empresa, moeda e ambiente; validar limites acumulados transacionalmente. Não converter devolução comercial automaticamente em crédito fiscal.
4. Implementar webhooks autenticados e idempotentes por provedor, com verificação da empresa, evento e documento. Timeout não autoriza retransmissão de emissão. Consulta manual limitada é alternativa quando webhook não estiver disponível.
5. Guardar XML/KuDE/PDF em armazenamento de arquivos. Firestore mantém referências, identidade, estados e totais; downloads só quando solicitados.
6. Auditoria por período e paginação: conferir venda, expedição, documento, devolução e financeiro. Resumos incrementais a partir de eventos processados uma vez, nunca recálculo do histórico inteiro no login.

## Validação e publicação

- Testes unitários do catálogo/validação: país, tipos, campos permitidos, credenciais e emissão bloqueada.
- Testes do cache: deduplicação, TTL, isolamento, atualização manual, falha e invalidação durante consulta.
- Testes de interface: troca de país/provedor, quatro documentos PY, comando único de salvamento e backend antigo.
- Testes do handler com dependências simuladas: persistência, no-op, isolamento, estado ativo, invalidação e ausência de transmissão.
- Publicar a função `fiscalSolicitacaoCliente` antes do frontend. A interface confirma a versão e falha sem escrever em backend antigo. Validar com uma loja de homologação antes de disponibilizar aos clientes.

Referências primárias consultadas em 01/11/2026:
- https://doc.focusnfe.com.br/reference/introducao
- https://www.sifende.com.py/docs/referencia/documentos-electronicos
- https://www.sifende.com.py/docs/referencia/modelos/nota-remision
- https://kuota.com.py/docs/api-notas-y-eventos/
- DNIT, Decreto 872/2023 e documentação SIFEN: https://www.dnit.gov.py/
