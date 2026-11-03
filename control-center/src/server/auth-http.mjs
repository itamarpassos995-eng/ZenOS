import {syncStatus,syncCsrf,verifySyncCsrf,startSync} from './organization-sync.mjs';
import {renderControlCenter} from './control-center-ui.mjs';
import {createHash} from 'node:crypto';
import {randomToken} from './auth-store.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=(title,body)=>`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Control Center</title><style>body{font:16px system-ui;background:#0e1920;color:#eef5f6;margin:0}main{max-width:960px;margin:8vh auto;padding:28px}h1{font-size:32px}a,button{color:#071c20;background:#45d8c3;padding:12px 20px;border:0;border-radius:8px;text-decoration:none;display:inline-block;font:inherit;cursor:pointer}section{background:#172730;padding:24px;border:1px solid #2e414b;border-radius:14px;margin:20px 0}input{font:inherit;padding:12px;border-radius:8px;max-width:90%}code{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #33464e}small{color:#adbec4}</style><main><small>ZenOS · Control Center · Homologação</small><h1>${escape(title)}</h1>${body}</main></html>`;
const cookie=(name,value,age)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function cookies(headers){const result={};for(const item of (headers.cookie||'').split(';')){const i=item.indexOf('=');if(i<0)continue;
  try{result[item.slice(0,i).trim()]=decodeURIComponent(item.slice(i+1).trim());}catch{}}
  return result;
}
const output=(status,body,extra={})=>({status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'referrer-policy':'same-origin','x-content-type-options':'nosniff',...extra},body});
const redirect=(url,extra={})=>output(303,'',{location:url,...extra});
const invalid=()=>output(401,page('Acesso não autorizado','<p>Entre novamente ou confira seu código de verificação.</p><a href="/auth/login">Entrar com Google</a>'));
export function createAuthHttp({store,verifyGoogle,handleApi,origin,clientId,clientSecret,fetchImpl=fetch,operations,saas,integration}){
  const base=new URL(origin);
  if(base.protocol!=='https:'||base.origin!==origin||!clientId||!clientSecret)throw Error('OAUTH_CONFIG_REQUIRED');
  const callback=origin+'/auth/google/callback';
  return async function handle({method='GET',url='/',headers={},body=''}){
    if(url.length>16384)return output(414,'');
    const u=new URL(url,origin),c=cookies(headers);
    if(u.pathname==='/internal/events'&&method==='POST'){
      if(!integration)return output(503,'');
      try{const r=await integration.incoming({body,headers});return {...r,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(r.body)};}catch{return output(400,'Evento não aceito');}
    }
    if(method==='POST' && headers.origin!==origin)return output(403,'');
    if(method==='GET'&&u.pathname==='/auth/login'){
      const state=randomToken(),browser=randomToken(),nonce=randomToken(),verifier=randomToken();
      await store.saveAttempt({state,browser,payload:{nonce,verifier}});
      const destination=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      destination.search=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:'openid email',
        state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
      return redirect(destination.href,{'set-cookie':cookie('zenos_oauth_browser',browser,300)});
    }
    if(method==='GET'&&u.pathname==='/auth/google/callback'){
      const state=u.searchParams.get('state'),code=u.searchParams.get('code');
      if(!state||!code||!c.zenos_oauth_browser)return invalid();
      const attempt=await store.consumeAttempt(state,c.zenos_oauth_browser);if(!attempt)return invalid();
      const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(10000),
        headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,
          client_secret:clientSecret,redirect_uri:callback,grant_type:'authorization_code',code_verifier:attempt.verifier})});
      if(!response.ok)return invalid();
      const data=await response.json(),identity=await verifyGoogle(data.id_token,attempt.nonce);
      if(!identity)return invalid();
      const admin=await store.authorizeGoogle(identity);if(!admin)return invalid();
      const challenge=await store.createChallenge(admin);
      return redirect('/auth/mfa',{'set-cookie':[cookie('zenos_oauth_browser','',0),cookie('zenos_mfa',challenge.token,300),cookie('zenos_mfa_csrf',challenge.csrf,300)]});
    }
    if(method==='GET'&&u.pathname==='/auth/mfa'){
      if(!c.zenos_mfa||!c.zenos_mfa_csrf)return invalid();
      const challenge=await store.challenge(c.zenos_mfa);if(!challenge)return invalid();
      const enrollment=challenge.enabled?'':`<section><h2>Cadastre seu autenticador</h2><p>Adicione uma conta no Google Authenticator ou outro aplicativo compatível. Selecione chave manual, tipo baseado em tempo e informe:</p><p>Conta: ${escape(challenge.email)}</p><p>Chave: <code>${escape(challenge.secret)}</code></p><p>Guarde essa chave em local seguro. Não a envie por mensagem.</p></section>`;
      return output(200,page('Verificação em duas etapas',enrollment+`<form method="post" action="/auth/mfa"><input type="hidden" name="csrf" value="${escape(c.zenos_mfa_csrf)}"><label>Código de 6 dígitos<br><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p><button>Verificar e entrar</button></p></form>`));
    }
    if(method==='POST'&&u.pathname==='/auth/mfa'){
      const form=new URLSearchParams(body);
      if(!c.zenos_mfa||form.get('csrf')!==c.zenos_mfa_csrf)return invalid();
      const token=await store.finishMfa({token:c.zenos_mfa,csrf:form.get('csrf'),code:form.get('code')});
      if(!token)return invalid();
      return redirect('/',{'set-cookie':[cookie('zenos_admin_session',token,3600),cookie('zenos_mfa','',0),cookie('zenos_mfa_csrf','',0)]});
    }
    if(method==='POST'&&u.pathname==='/auth/logout'){
      // Exact Origin check above prevents cross-site logout. No credential in body.
      if(c.zenos_admin_session)await store.logout(c.zenos_admin_session);
      return redirect('/',{'set-cookie':cookie('zenos_admin_session','',0)});
    }
    if(u.pathname==='/admin/organizations')return redirect('/clientes');
    if(['/clientes','/mensalidades','/planos','/solicitacoes'].includes(u.pathname)&&method==='POST'){
      if(!c.zenos_admin_session||!saas)return invalid();
      const admin=await store.verifySession(c.zenos_admin_session);
      if(!admin||admin.mfaVerified!==true)return output(403,'Acesso negado');
      const form=new URLSearchParams(body);
      if(!verifySyncCsrf(c.zenos_admin_session,form.get('csrf')))return output(403,'');
      const input=Object.fromEntries([...form].filter(([k])=>k!=='csrf'&&!k.startsWith('return_')));
      if(input.action==='plan')input.module_ids=form.getAll('module_ids').join(',');
      const permitted={'/clientes':['note','suspend','restore','bonus','subscribe','change_plan','cancel_subscription','grant','invoice'],'/mensalidades':['invoice','payment','discount','void'],'/planos':['plan','module'],'/solicitacoes':['request']};
      if(!permitted[u.pathname].includes(input.action))return output(400,'Ação inválida');
      try{await saas.mutate(admin,input);}catch(e){
        const messages={FORBIDDEN:'Seu perfil não permite esta ação.',COMMAND_ALREADY_PENDING:'Esta empresa já possui um comando pendente. Aguarde a confirmação.',CONFIRM_ORGANIZATION_REQUIRED:'Confirme o identificador exato da empresa.',SUBSCRIPTION_REQUIRED:'Cadastre uma assinatura antes de conceder dias.',CURRENCY_MISMATCH:'A moeda do recebimento deve ser igual à da cobrança.',OVERPAYMENT:'O pagamento excede o saldo.',IDEMPOTENCY_CONFLICT:'Este envio já foi usado com outros dados. Reabra o formulário.',ACTIVE_SUBSCRIPTION_EXISTS:'A empresa já possui assinatura; mudança de plano exige revisão da vigência.',PRICE_NOT_FOUND:'Não existe preço vigente para o plano e moeda selecionados.'};
        const result=renderControlCenter(u.pathname,{organizations:0,active_subscriptions:0,trials:0,overdue_invoices:0},[]);
        return output(e.message==='FORBIDDEN'?403:400,result.replace('<h1>',`<div class="notice" role="alert">Operação não concluída: ${escape(messages[e.message]||'Confira os dados, valores, datas e motivo antes de tentar novamente.')} <a href="${u.pathname}">Voltar</a></div><h1>`));
      }
      const params=new URLSearchParams();for(const k of ['q','page','country','status','sort','manage']){const v=form.get('return_'+k);if(v)params.set(k,v.slice(0,120));}
      return redirect(u.pathname+'?'+params.toString());
    }
    if(u.pathname==='/admin/sync-organizations'&&(method==='GET'||method==='POST')){
      if(!c.zenos_admin_session)return invalid();
      const auth=await handleApi({method:'GET',path:'/api/overview',headers});
      if(auth.status!==200)return invalid();
      const admin=await store.verifySession(c.zenos_admin_session);
      if(!admin?.roles?.includes('owner'))return output(403,page('Acesso negado','Somente o administrador proprietário pode executar a importação.'));
      if(method==='POST'){
        const form=new URLSearchParams(body);
        if(!verifySyncCsrf(c.zenos_admin_session,form.get('csrf')))return output(403,'');
        startSync();return redirect('/admin/sync-organizations');
      }
      const s=syncStatus();
      const action=s.state==='running'?'<p>Importação em andamento. Atualize esta página para consultar o resultado.</p>':
        s.configured?`<form method="post" action="/admin/sync-organizations"><input type="hidden" name="csrf" value="${syncCsrf(c.zenos_admin_session)}"><button>Importar empresas agora</button></form>`:
        '<p>Credencial FIREBASE_SERVICE_ACCOUNT_JSON ausente no serviço Render. Nenhuma importação executada.</p>';
      return output(200,page('Sincronização de empresas',`<section><p>Estado: ${escape(s.state)}</p><p>Resultado: ${escape(s.result||'—')}</p>${action}</section><a href="/clientes">Voltar aos clientes</a>`));
    }
    if(method==='GET'&&['/','/clientes','/mensalidades','/planos','/solicitacoes','/relatorios','/configuracoes'].includes(u.pathname)){
      if(!c.zenos_admin_session)return output(200,page('Sua central de gestão','<p>Acesso administrativo exclusivo. Entre com Google e confirme o código do autenticador.</p><a href="/auth/login">Entrar com Google</a>'));
      const overview=await handleApi({method,path:'/api/overview',headers});
      if(overview.status!==200)return invalid();
      const isClients=u.pathname==='/clientes';
      const admin=await store.verifySession(c.zenos_admin_session);
      const owner=Boolean(admin?.roles?.some(r=>['owner','billing','support','auditor'].includes(r))&&admin?.mfaVerified===true);
      const q=(u.searchParams.get('q')||'').slice(0,120);
      const rawPage=Number(u.searchParams.get('page')||1);
      const pageNumber=Number.isSafeInteger(rawPage)?Math.max(1,Math.min(100000,rawPage)):1;
      const context={roles:admin.roles,q,page:pageNumber,country:u.searchParams.get('country')||'',status:u.searchParams.get('status')||'',sort:u.searchParams.get('sort')||'name',manage:u.searchParams.get('manage')||'',integrationEnabled:integration?.enabled===true};
      const data=saas?await saas.snapshot(admin):null;
      if(context.manage&&!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(context.manage))return output(400,'Identificador inválido');
      const detail=isClients&&saas&&context.manage?await saas.detail(admin,context.manage):null;
      const controls=isClients&&operations?await operations.list({...context,pageSize:25}):{rows:[],total:0,page:1,pages:1};
      let rows=isClients&&!owner?controls.rows.map(({display_name,country})=>({display_name,country})):[];
      if(!isClients){
        const list=await handleApi({method,path:'/api/organizations',headers});
        if(list.status!==200)return output(list.status,page('Dados indisponíveis','<p>Tente novamente mais tarde.</p>'));
        rows=list.body.organizations;
      }
      return output(200,renderControlCenter(u.pathname,overview.body,rows,controls,owner?syncCsrf(c.zenos_admin_session):'',q,{data,detail,context}));
    }
    if(u.pathname.startsWith('/api/')||u.pathname==='/health'){
      const result=await handleApi({method,path:u.pathname,headers});return {...result,body:JSON.stringify(result.body)};
    }
    return output(404,page('Página não encontrada','<a href="/">Voltar</a>'));
  };
}
