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
