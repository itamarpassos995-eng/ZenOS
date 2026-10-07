import { gerarIdCliente, gerarIdProduto } from './core/productIdentity.js';
export const traducoes = {
  pt: {
    menuPrincipal: 'Menu Principal', pdvBalcao: 'PDV Balcão', produtosEstoque: 'Produtos & Estoque', clientesFiado: 'Clientes & Fiado', vendasDevolucoes: 'Vendas & Devoluções',
    perfil: 'PERFIL', vendedorBalcao: 'Vendedor Balcão', gerenciaDono: 'Gerência / Dono', caixaAberto: 'CAIXA ABERTO', cotacoes: 'Câmbio', configuracoes: 'Configurações',
    idioma: 'IDIOMA', moedaBase: 'MOEDA BASE', ajustarCambio: 'Ajustar Câmbio', modulosSistema: 'Módulos del Sistema',
    saudacaoHub: 'Olá, {nome}!', subtituloHub: 'A estrutura principal está estabilizada. O sistema de salvamento local está ativo.',
    vendidoHoje: 'Vendido Hoje', fiadoPraca: 'Fiado na Praça',
    cardPdvTitulo: 'Fazer Venda (Caixa)', cardPdvDesc: 'Abrir o balcão rápido, pesquisar itens, dar desconto e emitir o cupom.',
    cardProdutosTitulo: 'Produtos & Estoque', cardProdutosDesc: 'Cadastrar qualquer mercadoria, insumo ou serviço com preços múltiplos e margem.',
    cardClientesTitulo: 'Clientes & Fiado', cardClientesDesc: 'Controle de carteira, limites de fiado, dias de atraso e cobrança WhatsApp.',
    cardVendasTitulo: 'Vendas & Devoluções', cardVendasDesc: 'Consultar comandas já fechadas, cancelar vendas e devolver produtos fracionados.',
    cardNotasTitulo: 'Notas & Cupons', cardNotasDesc: 'Emissão de cupom não fiscal e faturamento.',
    cardRelatoriosTitulo: 'Relatórios & Lucro', cardRelatoriosDesc: 'Fechamento de caixa e curva ABC.', preparacao: 'Em preparação...',
    catalogoTitulo: 'Catálogo de Produtos', catalogoSub: 'Cadastre qualquer produto, insumo, fórmula ou serviço com tabela de preços múltiplos',
    restaurarPadroes: 'Restaurar Padrões', novoProdutoBtn: '+ Novo Produto', todosGrupos: 'Todos os Grupos', buscarProd: 'Filtrar por nome ou SKU...',
    fotoSku: 'Foto / SKU', descItem: 'Descrição do Item', grupoUnidade: 'Grupo & Unidade', estoque: 'Estoque', custo: 'Custo (R$)', preco1: 'Preço 1 (Balcão)', preco2: 'Preço 2 (Atacado)', margem: 'Margem', acoes: 'Ações',
    nenhumProd: 'Nenhum produto encontrado.', editar: 'Editar',
    clientesTitulo: 'Gestão de Clientes', clientesSub: 'CRM de fronteira: CPF/RUC, controle de atraso e recebimento split', novoClienteBtn: '+ Novo Cliente',
    totalFiado: 'Total Fiado', clientesCadastrados: 'Clientes Cadastrados', contasAbertas: 'Contas Abertas', limiteTotal: 'Limite Total Concedido',
    todosClientes: 'Todos os Clientes', comDivida: 'Com Dívida', buscarCli: 'Buscar por nome, documento ou telefone...',
    clienteRazao: 'Cliente / Razão Social', documento: 'Documento', contatoWhats: 'Contato / WhatsApp', tabela: 'Tabela Preço', limite: 'Limite', saldoDevedor: 'Saldo Devedor', situacao: 'Situação',
    nenhumCli: 'Nenhum cliente localizado.', receber: 'Receber', tabelaPintor: '⭐ Tabela Pintor', tabelaBalcao: 'Tabela Balcão',
    limiteExcedido: 'Limite Excedido', diasAtraso: 'Dias Atraso', aberto: 'Aberto', emDia: 'Em dia', cancelar: 'Cancelar', salvar: 'Salvar', cotacoesDia: 'Cotações do Dia',
    buscaPlaceholder: 'Digite o nome ou SKU do produto para iniciar a venda...',
    digiteProdutoLabel: '🔍 PESQUISAR PRODUTO NO BALCÃO'
  },
  es: {
    menuPrincipal: 'Menú Principal', pdvBalcao: 'TPV Mostrador', produtosEstoque: 'Productos y Stock', clientesFiado: 'Clientes y Créditos', vendasDevolucoes: 'Ventas y Devoluciones',
    perfil: 'PERFIL', vendedorBalcao: 'Vendedor', gerenciaDono: 'Gerencia / Dueño', caixaAberto: 'CAJA ABIERTA', cotacoes: 'Cambio', configuracoes: 'Configuración',
    idioma: 'IDIOMA', moedaBase: 'MONEDA BASE', ajustarCambio: 'Ajustar Cambio', modulosSistema: 'Módulos del Sistema',
    saudacaoHub: '¡Hola, {nome}!', subtituloHub: 'La estructura principal está estabilizada. El guardado local está activo.',
    vendidoHoje: 'Vendido Hoy', fiadoPraca: 'Crédito en Calle',
    cardPdvTitulo: 'Hacer Venta (Caja)', cardPdvDesc: 'Abrir mostrador rápido, buscar ítems, dar descuento y emitir ticket.',
    cardProdutosTitulo: 'Productos y Stock', cardProdutosDesc: 'Registrar mercaderías o servicios con precios múltiples y margen.',
    cardClientesTitulo: 'Clientes y Créditos', cardClientesDesc: 'Control de cartera, límites, días de mora y cobro WhatsApp.',
    cardVendasTitulo: 'Ventas y Devoluciones', cardVendasDesc: 'Consultar ventas cerradas, anular y devolver ítems fraccionados.',
    cardNotasTitulo: 'Facturas y Tickets', cardNotasDesc: 'Emisión de ticket no fiscal y facturación electrónica.',
    cardRelatoriosTitulo: 'Reportes y Ganancia', cardRelatoriosDesc: 'Cierre de caja y curva ABC.', preparacao: 'En preparación...',
    catalogoTitulo: 'Catálogo de Productos', catalogoSub: 'Registre cualquier producto con múltiples escalas de precios',
    restaurarPadroes: 'Restaurar Predeterminados', novoProdutoBtn: '+ Nuevo Producto', todosGrupos: 'Todos los Grupos', buscarProd: 'Filtrar por nombre o SKU...',
    fotoSku: 'Foto / SKU', descItem: 'Descripción del Ítem', grupoUnidade: 'Grupo y Unid', estoque: 'Stock', custo: 'Costo', preco1: 'Precio 1 (Mostrador)', preco2: 'Precio 2 (Mayorista)', margem: 'Margen', acoes: 'Acciones',
    nenhumProd: 'Ningún producto encontrado.', editar: 'Editar',
    clientesTitulo: 'Gestión de Clientes', clientesSub: 'CRM de frontera: CPF/RUC, control de mora y cobro split', novoClienteBtn: '+ Nuevo Cliente',
    totalFiado: 'Crédito Total', clientesCadastrados: 'Clientes Registrados', contasAbertas: 'Cuentas Abiertas', limiteTotal: 'Límite Total Concedido',
    todosClientes: 'Todos los Clientes', comDivida: 'Con Deuda', buscarCli: 'Buscar por nombre, documento o teléfono...',
    clienteRazao: 'Cliente / Razón Social', documento: 'Documento', contatoWhats: 'Contacto / WhatsApp', tabela: 'Tabla Precio', limite: 'Límite', saldoDevedor: 'Saldo Deudor', situacao: 'Estado',
    nenhumCli: 'Ningún cliente localizado.', receber: 'Cobrar', tabelaPintor: '⭐ Precio Pintor', tabelaBalcao: 'Precio Mostrador',
    limiteExcedido: 'Límite Excedido', diasAtraso: 'Días Mora', aberto: 'Abierto', emDia: 'Al día', cancelar: 'Cancelar', salvar: 'Guardar', cotacoesDia: 'Cotizaciones del Día',
    buscaPlaceholder: 'Escriba el nombre o SKU del producto para iniciar la venta...',
    digiteProdutoLabel: '🔍 BUSCAR PRODUCTO EN MOSTRADOR'
  },
  en: {
    menuPrincipal: 'Main Menu', pdvBalcao: 'POS Counter', produtosEstoque: 'Products & Stock', clientesFiado: 'Customers & Credit', vendasDevolucoes: 'Sales & Returns',
    perfil: 'PROFILE', vendedorBalcao: 'Cashier', gerenciaDono: 'Manager / Owner', caixaAberto: 'REGISTER OPEN', cotacoes: 'Exchange', configuracoes: 'Settings',
    idioma: 'LANGUAGE', moedaBase: 'BASE CURRENCY', ajustarCambio: 'Adjust Exchange Rate', modulosSistema: 'System Modules',
    saudacaoHub: 'Hello, {nome}!', subtituloHub: 'The main structure is stabilized. Local storage is active.',
    vendidoHoje: 'Sold Today', fiadoPraca: 'Open Credit',
    cardPdvTitulo: 'New Sale (POS)', cardPdvDesc: 'Fast counter checkout, search items, apply discount and print receipt.',
    cardProdutosTitulo: 'Products & Stock', cardProdutosDesc: 'Register goods, supplies or services with multi-tier pricing.',
    cardClientesTitulo: 'Customers & Credit', cardClientesDesc: 'Account management, credit limits, overdue days and WhatsApp billing.',
    cardVendasTitulo: 'Sales & Returns', cardVendasDesc: 'View completed receipts, void sales and process partial returns.',
    cardNotasTitulo: 'Receipts & Invoices', cardNotasDesc: 'Thermal receipt printing and fiscal invoicing.',
    cardRelatoriosTitulo: 'Reports & Profits', cardRelatoriosDesc: 'Register closing and best sellers.', preparacao: 'In preparation...',
    catalogoTitulo: 'Products Catalog', catalogoSub: 'Register any product with multi-tier pricing',
    restaurarPadroes: 'Restore Defaults', novoProdutoBtn: '+ New Product', todosGrupos: 'All Groups', buscarProd: 'Filter by name or SKU...',
    fotoSku: 'Photo / SKU', descItem: 'Item Description', grupoUnidade: 'Group & Unit', estoque: 'Stock', custo: 'Cost', preco1: 'Price 1 (Retail)', preco2: 'Price 2 (Wholesale)', margem: 'Margin', acoes: 'Actions',
    nenhumProd: 'No products found.', editar: 'Edit',
    clientesTitulo: 'Customer Management', clientesSub: 'Border CRM: CPF/RUC, overdue tracking and split payments', novoClienteBtn: '+ New Customer',
    totalFiado: 'Total Credit', clientesCadastrados: 'Registered Customers', contasAbertas: 'Open Accounts', limiteTotal: 'Total Limit Granted',
    todosClientes: 'All Customers', comDivida: 'With Debt', buscarCli: 'Search by name, document or phone...',
    clienteRazao: 'Customer / Company', documento: 'Document', contatoWhats: 'Contact / WhatsApp', tabela: 'Price Tier', limite: 'Limit', saldoDevedor: 'Balance Due', situacao: 'Status',
    nenhumCli: 'No customer found.', receber: 'Receive', tabelaPintor: '⭐ Pro Tier', tabelaBalcao: 'Retail Tier',
    limiteExcedido: 'Limit Exceeded', diasAtraso: 'Days Overdue', aberto: 'Open', emDia: 'Up to date', cancelar: 'Cancel', salvar: 'Save', cotacoesDia: 'Daily Exchange Rates',
    buscaPlaceholder: 'Type product name or SKU to start the sale...',
    digiteProdutoLabel: '🔍 SEARCH PRODUCT ON COUNTER'
  }
};

export const moedasConfig = { BRL: { rotulo: 'BRL (R$)', locale: 'pt-BR', simbolo: 'R$', moeda: 'BRL' }, USD: { rotulo: 'USD ($)', locale: 'en-US', simbolo: '$', moeda: 'USD' }, EUR: { rotulo: 'EUR (€)', locale: 'es-ES', simbolo: '€', moeda: 'EUR' }, PYG: { rotulo: 'PYG (₲)', locale: 'es-PY', simbolo: '₲', moeda: 'PYG' } };

export const normalizarProduto = (p, index = 0) => ({ ...p, id: gerarIdProduto(p, index), sku: p.sku || `SKU-${(index + 1).toString().padStart(2, '0')}`, nome: p.nome || '', tipoItem: p.tipoItem || 'mercadoria', unidadeMedida: p.unidadeMedida || 'UN', grupo: p.grupo || p.categoria || 'Geral', marca: p.marca || '', fornecedor: p.fornecedor || '', imagem: p.imagem || null, custoBRL: Number(p.custoBRL ?? p.custo ?? 0), precoBRL: Number(p.precoBRL ?? p.preco ?? 0), habilitarPreco2: Boolean(p.habilitarPreco2), preco2BRL: Number(p.preco2BRL ?? 0), habilitarPreco3: Boolean(p.habilitarPreco3), preco3BRL: Number(p.preco3BRL ?? 0), estoque: Number(p.estoque ?? 0), descricao: p.descricao || '', ncm: p.ncm || '3209.10.10', cest: p.cest || '24.001.00', cfop: p.cfop || '5.102', origem: p.origem || '0', codigoDnit: p.codigoDnit || '3209.10.00', ivaParaguai: p.ivaParaguai || '10', unidadMedidaPy: p.unidadMedidaPy || 'UNI' });

export const normalizarCliente = (c, index = 0) => ({ ...c, id: gerarIdCliente(c, index), nome: c.nome || '', perfilPreco: c.perfilPreco || 'preco1', pais: c.pais || 'BR', tipoDocumento: c.tipoDocumento || 'CPF', documento: c.documento || '', telefone: c.telefone || '', email: c.email || '', cidade: c.cidade || '', limiteCreditoBRL: Number(c.limiteCreditoBRL ?? 1000), saldoDevedorBRL: Number(c.saldoDevedorBRL ?? 0), diasAtraso: Number(c.diasAtraso ?? 0), observacoes: c.observacoes || '' });

export const produtosIniciais = [ normalizarProduto({ id: 'DEMO-PROD-TINT-01', sku: 'TINT-01', nome: 'Tinta Acrílica Fosca Base Clara 18L', unidadeMedida: 'L', grupo: 'Tintas Acrílicas', custoBRL: 160.00, precoBRL: 280.00, habilitarPreco2: true, preco2BRL: 250.00, estoque: 14, estoqueVitrine: 0, estoqueGalpao: 14 }), normalizarProduto({ id: 'DEMO-PROD-PIGM-01', sku: 'PIGM-01', nome: 'Pigmento Concentrado Amarelo Óxido 1L', tipoItem: 'materia_prima', unidadeMedida: 'L', grupo: 'Colorimetria', custoBRL: 45.00, precoBRL: 95.00, habilitarPreco2: true, preco2BRL: 85.00, estoque: 30, estoqueVitrine: 0, estoqueGalpao: 30 }) ];

export const clientesIniciais = [ normalizarCliente({ id: 'DEMO-CLI-MARCOS', nome: 'Marcos Roberto (Pinturas & Reformas)', perfilPreco: 'preco2', tipoDocumento: 'CPF', documento: '048.912.839-44', telefone: '45 99841-2233', limiteCreditoBRL: 3000.00, saldoDevedorBRL: 850.00, diasAtraso: 0 }), normalizarCliente({ id: 'DEMO-CLI-CONSTRUCTORA', nome: 'Constructora del Este S.A.', perfilPreco: 'preco2', pais: 'PY', tipoDocumento: 'RUC', documento: '80054231-4', telefone: '+595 983 550123', limiteCreditoBRL: 15000.00, saldoDevedorBRL: 4200.00, diasAtraso: 4 }) ];