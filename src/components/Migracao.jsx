import React, { useState } from 'react';
import { normalizarProduto, normalizarCliente } from '../data';
import ZenModal from './ZenModal';

export default function Migracao({ produtos, setProdutos, clientes, setClientes, t }) {
  const [dadosInput, setDadosInput] = useState('');
  const [tipoMigracao, setTipoMigracao] = useState('produtos');
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const [modalZen,setModalZen]=useState(null);

  const importarDadosEmMassa = () => {
    if (!dadosInput.trim()) return setModalZen({variante:'warning',titulo:'Dados ausentes',mensagem:'Cole os dados na caixa de texto primeiro.',apenasConfirmar:true});
    try {
      const linhas = dadosInput.split('\n');
      let contador = 0;

      if (tipoMigracao === 'produtos') {
        const novos = [...produtos];
        linhas.forEach(linha => {
          const partes = linha.split(/[\t,|]/);
          if (partes.length >= 2 && partes[0].trim() !== '') {
            const nome = partes[0].trim();
            const custo = parseFloat(partes[1]?.replace(',', '.')) || 0;
            const preco = parseFloat(partes[2]?.replace(',', '.')) || (custo * 1.5);
            const estoque = parseInt(partes[3]) || 0;
            novos.unshift(normalizarProduto({ nome, custoBRL: custo, precoBRL: preco, estoque }));
            contador++;
          }
        });
        setProdutos(novos);
      } else {
        const novosCli = [...clientes];
        linhas.forEach(linha => {
          const partes = linha.split(/[\t,|]/);
          if (partes.length >= 1 && partes[0].trim() !== '') {
            const nome = partes[0].trim();
            const documento = partes[1]?.trim() || '';
            const telefone = partes[2]?.trim() || '';
            novosCli.unshift(normalizarCliente({ nome, documento, telefone }));
            contador++;
          }
        });
        setClientes(novosCli);
      }
      setMensagemSucesso(`✓ ${contador} registos importados com sucesso!`);
      setDadosInput('');
      setTimeout(() => setMensagemSucesso(''), 5000);
    } catch (err) {
      setModalZen({variante:'danger',titulo:'Importação não concluída',mensagem:'Erro ao processar. Verifique se copiou corretamente.',apenasConfirmar:true});
    }
  };

  return (
    <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '32px', maxWidth: '800px', margin: '0 auto', color: '#fff' }}>
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} apenasConfirmar confirmarTexto="OK" onConfirmar={()=>setModalZen(null)} onCancelar={()=>setModalZen(null)} />
      <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}><span>📥</span> Importador Universal</h2>
      <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
        Cole abaixo os dados copiados do seu Excel ou sistema antigo.<br/>
        Formato para Produtos: <code style={{ color: '#38bdf8' }}>Nome | Custo | Preço Venda | Estoque</code><br/>
        Formato para Clientes: <code style={{ color: '#fbbf24' }}>Nome | Documento | Telefone</code>
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => setTipoMigracao('produtos')} style={{ flex: 1, padding: '12px', backgroundColor: tipoMigracao === 'produtos' ? '#0284c7' : '#020617', border: `1px solid ${tipoMigracao === 'produtos' ? '#38bdf8' : '#334155'}`, borderRadius: '10px', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Importar Produtos</button>
        <button onClick={() => setTipoMigracao('clientes')} style={{ flex: 1, padding: '12px', backgroundColor: tipoMigracao === 'clientes' ? '#d97706' : '#020617', border: `1px solid ${tipoMigracao === 'clientes' ? '#fbbf24' : '#334155'}`, borderRadius: '10px', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Importar Clientes</button>
      </div>

      <textarea rows="10" value={dadosInput} onChange={e => setDadosInput(e.target.value)} placeholder={tipoMigracao === 'produtos' ? "Ex:\nTinta Acrílica 18L\t150.00\t250.00\t20\nMassa Corrida\t35.00\t70.00\t15" : "Ex:\nJoão da Silva\t048.912.839-44\t45 99841-2233\nConstrutora Alfa\t80054231-4"} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', padding: '16px', color: '#34d399', fontFamily: 'monospace', fontSize: '14px', outline: 'none', marginBottom: '16px', boxSizing: 'border-box' }} />

      {mensagemSucesso && <div style={{ padding: '14px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399', borderRadius: '10px', marginBottom: '16px', fontWeight: 800 }}>{mensagemSucesso}</div>}

      <button onClick={importarDadosEmMassa} style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '15px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
        🚀 Processar e Carregar no Zenos OS
      </button>
    </div>
  );
}