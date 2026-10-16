# ZenOS Commerce Studio — Midia Privada P3 (homologação, SEM DEPLOY)

**Base:** PR #30, `feat/commerce-studio-galeria-p2-homologacao-20261016`. Atualização somente nos arquivos Commerce. Preserva `src/components/Produtos.jsx`, o campo operacional `produto.imagem`, caixa, estoque, financeiro, fiscal e autenticação existente.

## Funcionalidade

1. A galeria de até 8 fotos adicionais por produto usa a Cloud Function `commerceMidia`. O navegador otimiza para WebP, principal no máximo 1800 px e miniatura no máximo 480 px. O backend verifica autenticação Firebase, isolamento `auth.uid`, existência da loja e do produto salvo no documento operacional, limites de bytes, assinatura e dimensões WebP.
2. A identidade da imagem é SHA-256 dos bytes processados. O servidor salva em `commerce/{uid}/produtos/{produtoId}/galeria/{hash}.webp` e miniatura separada. O retry idêntico reutiliza os objetos existentes.
3. A fotografia V1 do campo `produto.imagem` é **somente lida**. Ao salvar o rascunho de um produto marcado como publicado, o Studio tenta copiar uma versão otimizada para `.../cadastro/{hash}.webp`; o cadastro original nunca é apagado, substituído ou regravado. Se a mídia não estiver configurada/falhar, o rascunho pode ser salvo e o editor informa que a imagem continua pendente — a loja segue privada.
4. Firestore salva somente `storagePath` e outros metadados mínimos; **não salva a foto Base64 nem URLs assinadas com prazo**. No `consultar`, o servidor confirma metadados e fornece URLs privadas com validade de **30 minutos**. Isso pode exigir recarregar a tela após expiração.
5. `salvarRascunho` verifica o vínculo do objeto e da miniatura a loja e produto por metadados do bucket antes da escrita da referência. Nenhum arquivo é exposto na loja pública.

## TRAVA DE CUSTOS E PRODUÇÃO

`commerceMidia` recusa todo upload, por padrão, até que o backend tenha **ambas** as variáveis explicitamente configuradas:

- `ZENOS_COMMERCE_MEDIA_ENABLED=true`
- `ZENOS_COMMERCE_STORAGE_BUCKET=<bucket privado separado/autorizado>`

**Não definir essas variáveis sem autorização para custos, configuração de bucket, regras e controle de recursos.** Nunca colocar essas variáveis/credenciais no frontend. Cloud Storage, Cloud Functions e URLs assinadas podem gerar custo operacional. Ainda não foi confirmado que o projeto possui Storage habilitado ou que as regras de produção protegem o bucket: verificar primeiro.

O frontend só habilita `Adicionar fotos` se a função `consultar` informar `midiaDisponivel=true`. O editor segue utilizável sem upload. A função nova será exportada, mas **não invocada automaticamente** em produção quando desligada. Não altera `firebase.json` nem `firestore.emulator.rules` permissivas (NÃO publicar estas regras).

## Segurança e limites ainda pendentes antes da liberação

- Validar a autenticação real dos operadores: o login Firebase é de loja, e a permissão de gerente local **não é uma identidade server-side**. O serviço P3 limita a loja, mas precisa de autenticação individual ou claims administrativas antes de habilitar uploads para operadores de uma loja compartilhada.
- Auditar o bucket GCS, regras reais, IAM da conta que assina URLs, CORS caso mude a estratégia, quotas diárias e limpeza de arquivos órfãos. Uma URL temporária é portadora de acesso durante sua validade.
- Testar no Firebase Emulator com dois tenants e depois num projeto de homologação real, especialmente assinatura de URLs; o emulator pode não reproduzir permissões IAM. **Os testes locais de funções puras não provam integrações de Storage.**
- Auditar também as imagens *externas HTTPS* digitadas manualmente (banners) antes de publicar: não são validadas como objetos GCS; não aceitar para publicação sem política de mídia definida.
- O storefront público, pagamentos, assinatura, checkout, baixa de estoque e publicação **continuam desativados**.

## Verificações executáveis

```bash
node scripts/commerce-media-p3-check.mjs
node scripts/commerce-images-check.mjs
node scripts/commerce-premium-v2-check.mjs
node scripts/commerce-studio-server-check.mjs
npm run build  # no checkout completo
```

Esses testes devem passar antes de qualquer merge e precisam ser complementados com Auth + Functions + Firestore + Storage Emulator e homologação de navegador. PR deve permanecer draft até cumprir todos os gates.
