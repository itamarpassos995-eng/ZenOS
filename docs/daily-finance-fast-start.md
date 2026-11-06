# Períodos financeiros e recarga V2

O painel executivo inicia em Hoje (dia local do estabelecimento/navegador), sem
restaurar seleções anteriores. Hoje, Este mês, Mês anterior e Personalizado usam
intervalos semiabertos: início incluso, meia-noite após o último dia excluída.
Datas personalizadas inválidas não incluem registros. Receita, CMV, lucro e ABC
usam a data da venda; despesas realizadas usam dataPagamento. O fiado é um saldo
acumulado identificado separadamente. A auditoria de caixas também inicia hoje;
o histórico permanece acessível por escolha explícita.

Filtros de interface não apagam nem recortam a base usada para gravar operações.
Cadastros, pendências antigas, sessões abertas e saldos precisam permanecer
completos. Esta entrega não afirma que toda a base operacional passou a ser uma
consulta por data. Sem cache válido, a primeira carga ainda precisa formar a
base certificada; limitar essa base a hoje perderia o contexto de estoque e fiado.

## Redução efetiva de leituras na recarga

Um IndexedDB separado guarda um snapshot atômico e um diário de recibos já
confirmados. O escopo inclui projeto, usuário e geração. Ele evita a mistura entre
páginas do cache do SDK que invalida o checkpoint após operações normais.

A recarga consulta o controle de armazenamento e o cabeçalho no servidor;
reconstitui o snapshot local, aplica recibos e consulta somente operações com
sequence maior, quando necessário. Confere novamente cabeçalho, origem,
manifesto, sequência, revisões e contagens antes de liberar a sessão. Uma recarga
sem alterações exige zero consultas de coleções operacionais pelo servidor.
Nenhum listener extra foi introduzido. PIN, autenticação e confirmações de
escrita continuam obrigatórios.

Recibos são gravados individualmente, sem regravar todos os cadastros por venda.
A próxima abertura compacta o diário confirmado. Transações IndexedDB impedem
que uma aba atrasada substitua uma base mais recente ou remova recibos futuros.
Timestamps e GeoPoints Firestore preservam tipos e representação canônica;
tipos não suportados desativam o cache opcional. Cache incompleto, lacunas,
origem divergente ou armazenamento indisponível usam o caminho certificado
anterior. Uma falha local não transforma uma venda já confirmada em erro.

## Verificação

Testes cobrem recarga sem download, catch-up incremental, persistência de
recibos ao vivo, abas atrasadas, isolamento de projeto/loja/geração, lacunas,
contagens incompletas, checksum divergente e preservação de timestamps.
Testes de período cobrem virada de ano, limites inclusivos/exclusivos,
pagamento fora do período e datas inválidas, sem mutação dos históricos.


## Entrada antes da base completa

O formulário do terminal não deve aguardar produtos, clientes ou históricos.
O mesmo bootstrap V2 publica primeiro os operadores: no caminho sem cache, a
coleção operadores é priorizada e suas páginas são reutilizadas na base completa.
No cache persistente, a prévia exige contagem e revisão de operadores iguais ao
cabeçalho remoto. Nenhuma consulta ou assinatura nova é criada para a prévia.
Uma prévia não libera nenhuma gravação.

Após informar o PIN, o acesso aguarda a base completa, resolve o operador de
novo nesse snapshot e valida novamente o PIN. Remoção de operador, alteração de
credencial ou de permissões durante a carga não permite usar o acesso antigo.
A troca de usuário cancela o efeito visual da tentativa anterior. O administrador
temporário só mantém o fluxo existente de primeiro acesso, sem reaproveitar uma
prévia removida. O botão aguarda a confirmação e impede envios duplicados.

As telas operacionais são importadas sob demanda após o acesso. O pacote
principal de produção caiu de aproximadamente 934 KB para 257 KB antes de gzip;
essa redução não representa uma medição de tempo na conexão real do cliente.
O teste do App autentica a loja, disponibiliza operadores e mantém o snapshot
completo pendente: o PIN aparece enquanto o catálogo ainda carrega. Depois muda
o PIN no snapshot final e verifica que o acesso antigo é recusado.
