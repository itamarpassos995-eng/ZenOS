# Control Center V2 — contrato de implementação isolada

Branch de trabalho: `feat/control-center-v2-premium-isolada`.
Base: `feat/control-center-google-mfa-base`.
Homologação Render permanece apontada à base; não publicar sem testes e autorização.

## Referência de interface
Reproduzir a prévia `https://zenos-control-center-preview.vercel.app` e os screenshots aprovados: sidebar navy, header branco, superfície cinza-clara, cards brancos e ações turquesa. Preservar identidade ZenOS. A prévia contém valores demonstrativos que jamais podem ser tratados como reais.

## Diagnóstico da base
- `src/server/auth-http.mjs`: renderização HTML simplificada e autenticação Google/MFA.
- `src/api/http.mjs`: endpoints GET de health, overview e organizations, sem mutações.
- `src/api/postgres-repository.mjs`: contagens e lista limitada de organizações.
- `src/server/start.mjs`: conexão ao banco exclusivo de homologação, sem alteração de produção.

## Contratos obrigatórios
1. Cada ação administrativa deve validar sessão, MFA, permissão, CSRF, entidade e estado atual; registrar motivo, ator, timestamps e trilha de auditoria em transação.
2. Bloqueio é exclusivamente suspensão de acesso, nunca exclusão de dados. Pagamento confirmado e ausência de outros impedimentos permitem reativação; também oferecer liberação manual auditada. Não interromper operações em andamento nem descartar sincronização pendente.
3. Bônus e promoções exigem elegibilidade, prazo, limites, moeda e registro histórico. Financeiro deve ter idempotência e valores decimais.
4. Toda ação em empresas reais fica desativada até autorização explícita e integração efetiva com o ZenOS; não afirmar sucesso de bloqueio no PDV por simples mudança no PostgreSQL.
5. Atualização de indicadores por eventos autenticados, incrementais e idempotentes; sem varredura, listeners duplicados ou polling frequente no Firestore.
6. Estados vazios reais; nenhum dado demo em dashboards operacionais. Botões de função não implementada ficam desabilitados e explicados, nunca falsamente funcionais.
7. Não modificar Firebase, regras, dados de clientes, `main`, projeto Vercel `zen-os`, segredos, `CONTROL_CENTER_AUTH_KEY` ou PostgreSQL de produção. Não repetir migration 001.
8. Executar testes unitários, integração, segurança, fluxos de ponta a ponta e CI antes de solicitar publicação na homologação.

## Etapas de entrega
- A: layout premium com navegação funcional e indicadores reais existentes.
- B: APIs PostgreSQL para empresas, planos, módulos, bônus, promoções, mensalidades, solicitações e auditoria.
- C: autorização e testes de concorrência, idempotência e integridade.
- D: adaptadores de eventos testados isoladamente, sem ativação Firebase.
- E: homologação e evidências; produção somente após autorização.

## Critério de verdade
Distinguir: implementado, testado isoladamente, publicado na homologação, integrado com clientes reais. Nunca confundir esses estados.
