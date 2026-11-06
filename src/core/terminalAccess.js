// Resolve permissions from the completed authoritative snapshot, never from
// the early PIN form. An operator removed during bootstrap cannot sign in.
export function operadorConfirmadoTerminal({vendedores,operadorId,adminInicial=null}) {
 const rows=Array.isArray(vendedores)?vendedores:[];
 const selected=rows.find(v=>String(v.id)===String(operadorId));
 if(selected)return selected;
 // Existing first-access policy: only the freshly initialized default admin,
 // with mandatory PIN replacement, when no early operator preview was used.
 if(rows.length===0&&String(operadorId)==='admin'&&adminInicial?.id==='admin'
   &&adminInicial.senha==='admin'&&adminInicial.pinTrocaObrigatoria===true)return adminInicial;
 return null;
}
