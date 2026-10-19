// Contrato de isolamento do backend operacional HML. Nunca aceitar dados de
// um backend antigo/legado nem exibir informações antes de conferir a origem.
// Produção mantém o seu próprio contrato; esta trava só é usada no preview HML.
export const CONTRATO_HML_ISOLAMENTO='zenos-commerce-tenant-20261019-v1';
export function conferirRespostaHml(dados,lojaId){
 if(!lojaId||typeof lojaId!=='string'||
    !dados||typeof dados!=='object'||Array.isArray(dados)||
    dados.lojaId!==lojaId||dados.contratoHml!==CONTRATO_HML_ISOLAMENTO)
  throw new Error('Commerce da homologação está com uma versão de servidor incompatível ou identidade de loja divergente. Operação bloqueada; nenhum dado foi exibido ou salvo.');
 return dados;
}
