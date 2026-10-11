import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../firebase';
import './FiscalContratacao.css';

const CAMPOS = {
  BR: {
    basicos: [['razaoSocial','Razão social','Razón social','Legal name'],['cnpj','CNPJ','CNPJ','CNPJ']],
    complementares: [['inscricaoEstadual','Inscrição estadual','Inscripción estatal','State tax registration'],['inscricaoMunicipal','Inscrição municipal','Inscripción municipal','Municipal registration'],['uf','UF','Estado','State'],['municipioCodigoIbge','Código IBGE do município','Código IBGE del municipio','IBGE municipality code'],['endereco','Endereço completo','Dirección completa','Full address'],['cep','CEP','Código postal','ZIP code'],['codigoServico','Código de serviço (NFS-e)','Código de servicio (NFS-e)','Service code (NFS-e)']]
  },
  PY: {
    basicos: [['razonSocial','Razón social','Razón social','Legal name'],['ruc','RUC sem DV','RUC sin DV','RUC excluding check digit']],
    complementares: [['dv','Dígito verificador','Dígito verificador','Check digit'],['direccion','Endereço','Dirección','Address'],['departamento','Departamento','Departamento','Department'],['distrito','Distrito','Distrito','District'],['establecimiento','Estabelecimento','Establecimiento','Establishment'],['puntoExpedicion','Ponto de expedição','Punto de expedición','Issuing point'],['timbrado','Timbrado','Timbrado','Stamp number']]
  }
};
const CONTATO = [['responsavel','Nome do responsável','Nombre del responsable','Contact name'],['telefone','Telefone / WhatsApp','Teléfono / WhatsApp','Phone / WhatsApp'],['email','E-mail','Correo electrónico','Email']];

function mensagemErro(error, tx) {
  const code = String(error?.code || '');
  if (code.includes('unauthenticated')) return tx('Sua sessão expirou. Faça login novamente.','Tu sesión expiró. Inicia sesión de nuevo.','Your session expired. Please sign in again.');
  if (code.includes('permission-denied')) return tx('Não foi possível validar o acesso fiscal desta loja. Contate o suporte.','No fue posible validar el acceso fiscal de esta tienda. Contacta soporte.','This store could not be authorized for fiscal access. Contact support.');
  if (code.includes('invalid-argument')) return error?.message || tx('Revise os dados informados.','Revisa los datos.','Review the entered data.');
  return tx('O serviço de solicitações fiscais não está disponível neste momento. Nenhum cadastro foi confirmado.','El servicio de solicitudes fiscales no está disponible en este momento. No se confirmó ningún registro.','Fiscal requests are temporarily unavailable. No registration has been confirmed.');
}
export default function FiscalContratacao({ lojaId, perfilLoja, tx = pt => pt }) {
  const [registro, setRegistro] = useState(null);
  const [pais, setPais] = useState(perfilLoja?.pais === 'PY' ? 'PY' : 'BR');
  const [cadastro, setCadastro] = useState({});
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [disponivel, setDisponivel] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [formAberto, setFormAberto] = useState(false);

  const chamar = (action, extras = {}) => httpsCallable(
    getFunctions(undefined, 'southamerica-east1'),
    'fiscalSolicitacaoCliente',
    { timeout: 15000 }
  )({ action, lojaId, ...extras });

  const consultar = async (ativo = () => true) => {
    if (!lojaId || !auth.currentUser) {
      if (ativo()) {
        setCarregando(false);
        setDisponivel(false);
        setErro(tx('Entre na conta da loja para consultar o módulo fiscal.','Inicia sesión en la cuenta de la tienda para consultar el módulo fiscal.','Sign in to the store account to check fiscal services.'));
      }
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const resposta = await chamar('consultar');
      if (!ativo()) return;
      const dados = resposta?.data;
      if (!dados || typeof dados.status !== 'string') throw new Error('FISCAL_RESPOSTA_INVALIDA');
      setRegistro(dados);
      if (dados.pais) setPais(dados.pais);
      if (dados.cadastro) setCadastro(dados.cadastro);
      setDisponivel(true);
    } catch (error) {
      if (!ativo()) return;
      setDisponivel(false);
      setRegistro(null);
      setFormAberto(false);
      setErro(mensagemErro(error, tx));
    } finally {
      if (ativo()) setCarregando(false);
    }
  };

  useEffect(() => {
    let ativo = true;
    setRegistro(null);
    setFormAberto(false);
    setDisponivel(false);
    consultar(() => ativo);
    return () => { ativo = false; };
  }, [lojaId]);

  const status = registro?.status || 'nao_solicitado';
  const editavel = ['nao_solicitado', 'rejeitado', 'em_analise'].includes(status);
  const rotulos = {
    nao_solicitado: tx('Disponível para solicitar','Disponible para solicitar','Available to request'),
    em_analise: tx('Solicitação em análise','Solicitud en revisión','Request under review'),
    aguardando_credenciamento: tx('Aguardando credenciamento','Pendiente de habilitación','Awaiting accreditation'),
    rejeitado: tx('Correção necessária','Se requiere corrección','Correction required'),
    aprovado: tx('Cadastro aprovado — aguardando ativação','Registro aprobado — pendiente de activación','Registration approved — awaiting activation'),
    ativo: tx('Módulo habilitado','Módulo habilitado','Module enabled')
  };
  const mudar = (campo, valor) => setCadastro(atual => ({ ...atual, [campo]:valor }));
  const enviar = async event => {
    event.preventDefault();
    if (!disponivel || !editavel || enviando) return;
    if (!cadastro.telefone?.trim() && !cadastro.email?.trim()) {
      setErro(tx('Informe um telefone ou e-mail para receber o retorno da equipe.','Indica teléfono o correo para recibir respuesta.','Enter a phone number or email to receive a response.'));
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      const resposta = await chamar('solicitar', { pais, cadastro });
      if (resposta?.data?.status !== 'em_analise') throw new Error('FISCAL_RESPOSTA_INVALIDA');
      setRegistro(atual => ({ ...atual, ...resposta.data, pais, cadastro }));
      setFormAberto(false);
    } catch (error) {
      setErro(tx('Não foi possível confirmar o envio. Verifique a situação antes de reenviar.','No se pudo confirmar el envío. Comprueba el estado antes de volver a intentarlo.','Could not confirm the submission. Check its status before retrying.'));
    } finally {
      setEnviando(false);
    }
  };
  const campo = ([nome, pt, es, en], required = false) => (
    <label className="fiscal-onboard-field" key={nome}>
      <span>{tx(pt, es, en)}{required ? ' *' : ''}</span>
      <input
        name={nome}
        value={cadastro[nome] || ''}
        onChange={event => mudar(nome, event.target.value)}
        required={required}
        maxLength={['endereco', 'direccion'].includes(nome) ? 300 : 180}
        inputMode={['cnpj','ruc','cep','telefone','dv','municipioCodigoIbge'].includes(nome) ? 'numeric' : nome === 'email' ? 'email' : 'text'}
        autoComplete={nome === 'email' ? 'email' : nome === 'telefone' ? 'tel' : 'off'}
        type={nome === 'email' ? 'email' : 'text'}
      />
    </label>
  );

  return <section className="fiscal-contratacao" aria-label={tx('Contratação do módulo fiscal','Contratación del módulo fiscal','Fiscal module subscription')}>
    <div className="fiscal-onboard-heading">
      <div className="fiscal-onboard-symbol" aria-hidden="true">▤</div>
      <div>
        <span className="fiscal-onboard-kicker">ZENOS FISCAL · {tx('MÓDULO OPCIONAL','MÓDULO OPCIONAL','OPTIONAL MODULE')}</span>
        <h2>{tx('Notas fiscais no seu ZenOS','Facturación fiscal en tu ZenOS','Fiscal invoicing in ZenOS')}</h2>
        <p>{tx('Solicite a habilitação do módulo fiscal para sua loja. Seu PDV continua funcionando normalmente.','Solicita la habilitación fiscal de tu tienda. Tu punto de venta sigue funcionando normalmente.','Request fiscal activation for your store. Your POS continues operating as normal.')}</p>
      </div>
    </div>
    <div className="fiscal-onboard-status" role="status">
      <span className={'fiscal-onboard-dot' + (!disponivel ? ' fiscal-onboard-dot-muted' : '')} />
      <strong>{carregando
        ? tx('Verificando disponibilidade…','Comprobando disponibilidad…','Checking availability…')
        : !disponivel
          ? tx('Solicitações temporariamente indisponíveis','Solicitudes temporalmente no disponibles','Requests temporarily unavailable')
          : rotulos[status] || status}</strong>
    </div>
    {erro && <div className="fiscal-onboard-alert" role="alert">{erro}</div>}
    {!carregando && !disponivel && <button className="fiscal-onboard-secondary" type="button" onClick={() => consultar()}>
      {tx('Tentar novamente','Intentar de nuevo','Try again')}
    </button>}
    {!carregando && disponivel && !formAberto && <>
      {status === 'em_analise' && <p className="fiscal-onboard-note">{tx('Seu pedido está registrado. A equipe ZenOS analisará os dados. A emissão de notas ainda não está ativada.','Tu solicitud está registrada. El equipo ZenOS revisará los datos. La emisión todavía no está activa.','Your request has been recorded. ZenOS will review it. Issuing is not yet active.')}</p>}
      {status === 'aguardando_credenciamento' && <p className="fiscal-onboard-note">{tx('Cadastro analisado. Agora é necessário concluir contratação, credenciamento e homologação.','Registro revisado. Es necesario completar contratación, habilitación y homologación.','Registration reviewed. Subscription, accreditation, and testing are still needed.')}</p>}
      {editavel && <button className="fiscal-onboard-primary" type="button" onClick={() => {setErro(''); setFormAberto(true);}}>
        {status === 'nao_solicitado'
          ? tx('Solicitar módulo fiscal','Solicitar módulo fiscal','Request fiscal module')
          : tx('Revisar dados da solicitação','Revisar los datos de la solicitud','Review request details')}
        <span aria-hidden="true">→</span>
      </button>}
    </>}
    {disponivel && formAberto && editavel && <form className="fiscal-onboard-form" onSubmit={enviar}>
      <div className="fiscal-onboard-form-header">
        <div>
          <span className="fiscal-onboard-kicker">{tx('ETAPA 1 DE 1','PASO 1 DE 1','STEP 1 OF 1')}</span>
          <h3>{tx('Dados para solicitação','Datos de la solicitud','Request information')}</h3>
        </div>
        <button type="button" className="fiscal-onboard-textbutton" onClick={() => {setFormAberto(false);setErro('');}}>
          {tx('Fechar','Cerrar','Close')}
        </button>
      </div>
      <label className="fiscal-onboard-field fiscal-onboard-country">
        <span>{tx('País da empresa','País de la empresa','Company country')}</span>
        <select value={pais} onChange={event => {setPais(event.target.value);setCadastro({});}}>
          <option value="BR">Brasil</option>
          <option value="PY">Paraguay</option>
        </select>
      </label>
      <div className="fiscal-onboard-grid">
        {CAMPOS[pais].basicos.map(item => campo(item, true))}
        {CONTATO.map(item => campo(item, false))}
      </div>
      <details className="fiscal-onboard-extra">
        <summary>{tx('Informações fiscais complementares','Datos fiscales adicionales','Additional tax details')}</summary>
        <p>{tx('Preencha os dados que tiver disponíveis. A equipe poderá solicitar outros documentos durante o credenciamento.','Completa los datos que tengas. El equipo podrá solicitar más documentos durante la habilitación.','Fill in the details you have. Additional records may be requested for accreditation.')}</p>
        <div className="fiscal-onboard-grid">{CAMPOS[pais].complementares.map(item => campo(item))}</div>
      </details>
      <p className="fiscal-onboard-privacy">{tx('O envio é uma solicitação, não uma cobrança ou autorização de emissão. Não informe senhas, certificados ou chaves de API neste formulário.','El envío es una solicitud, no un cobro ni autorización de emisión. No ingreses contraseñas, certificados o claves API aquí.','This is a request, not a charge or issuance approval. Do not provide passwords, certificates or API keys here.')}</p>
      <button className="fiscal-onboard-primary" type="submit" disabled={enviando}>
        {enviando ? tx('Enviando…','Enviando…','Sending…') : tx('Enviar solicitação','Enviar solicitud','Submit request')}
        {!enviando && <span aria-hidden="true">→</span>}
      </button>
    </form>}
  </section>;
}
