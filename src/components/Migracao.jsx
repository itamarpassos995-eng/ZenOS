import React, { useState } from 'react';
import { normalizarProduto, normalizarCliente } from '../data';
import ZenModal from './ZenModal';

export default function Migracao({ commitOperacaoNegocio, produtos, setProdutos, clientes, setClientes, t, tx = (pt) => pt }) {
  const [dadosInput, setDadosInput] = useState('');
  const [tipoMigracao, setTipoMigracao] = useState('produtos');
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const [modalZen,setModalZen]=useState(null);

  const importarDadosEmMassa = async () => {
    if (!dadosInput.trim()) return setModalZen({variante:'warning',titulo:tx('Dados ausentes','Datos ausentes','Missing data'),mensagem:tx('Cole os dados na caixa de texto primeiro.','Pegue los datos en el cuadro de texto primero.','Paste the data into the text box first.'),apenasConfirmar:true});
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
        if (typeof commitOperacaoNegocio === 'function') {
          const confirmado = await commitOperacaoNegocio({ changes:[{ field:'produtos', value:novos, storageSuffix:'produtos' }] });
          if (!confirmado?.cloudOk) throw confirmado?.error || new Error(tx('A nuvem não confirmou a importação de produtos.','La nube no confirmó la importación de productos.','The cloud did not confirm the product import.'));
          setProdutos(confirmado.values?.produtos || novos);
        } else setProdutos(novos);
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
        if (typeof commitOperacaoNegocio === 'function') {
          const confirmado = await commitOperacaoNegocio({ changes:[{ field:'clientes', value:novosCli, storageSuffix:'clientes' }] });
          if (!confirmado?.cloudOk) throw confirmado?.error || new Error(tx('A nuvem não confirmou a importação de clientes.','La nube no confirmó la importación de clientes.','The cloud did not confirm the customer import.'));
          setClientes(confirmado.values?.clientes || novosCli);
        } else setClientes(novosCli);
      }
      setMensagemSucesso(`✓ ${contador} registos importados com sucesso!`);
      setDadosInput('');
      setTimeout(() => setMensagemSucesso(''), 5000);
    } catch (err) {
      setModalZen({variante:'danger',titulo:tx('Importação não concluída','Importación no concluida','Import not completed'),mensagem:err?.message || tx('Erro ao processar. Verifique se copiou corretamente.','Error al procesar. Verifique si copió correctamente.','Processing error. Check that the data was copied correctly.'),apenasConfirmar:true});
    }
  };

  return (
    <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '32px', maxWidth: '800px', margin: '0 auto', color: '#fff' }}>
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} apenasConfirmar confirmarTexto="OK" onConfirmar={()=>setModalZen(null)} onCancelar={()=>setModalZen(null)} />
      <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}><span>📥</span> {tx('Importador Universal','Importador Universal','Universal Importer')}</h2>
      <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
        {tx('Cole abaixo os dados copiados do seu Excel ou sistema antigo.','Pegue abajo los datos copiados de su Excel o sistema anterior.','Paste below the data copied from your Excel or previous system.')}<br/>
        {tx('Formato para Produtos:','Formato para Productos:','Format for Products:')} <code style={{ color: '#38bdf8' }}>{tx('Nome | Custo | Preço Venda | Estoque','Nombre | Costo | Precio Venta | Stock','Name | Cost | Sale Price | Stock')}</code><br/>
        {tx('Formato para Clientes:','Formato para Clientes:','Format for Customers:')} <code style={{ color: '#fbbf24' }}>{tx('Nome | Documento | Telefone','Nombre | Documento | Teléfono','Name | Document | Phone')}</code>
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => setTipoMigracao('produtos')} style={{ flex: 1, padding: '12px', backgroundColor: tipoMigracao === 'produtos' ? '#0284c7' : '#020617', border: `1px solid ${tipoMigracao === 'produtos' ? '#38bdf8' : '#334155'}`, borderRadius: '10px', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{tx('Importar Produtos','Importar Productos','Import Products')}</button>
        <button onClick={() => setTipoMigracao('clientes')} style={{ flex: 1, padding: '12px', backgroundColor: tipoMigracao === 'clientes' ? '#d97706' : '#020617', border: `1px solid ${tipoMigracao === 'clientes' ? '#fbbf24' : '#334155'}`, borderRadius: '10px', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{tx('Importar Clientes','Importar Clientes','Import Customers')}</button>
      </div>

      <textarea rows="10" value={dadosInput} onChange={e => setDadosInput(e.target.value)} placeholder={tipoMigracao === 'produtos' ? tx("Ex:\nTinta Acrílica 18L\t150.00\t250.00\t20\nMassa Corrida\t35.00\t70.00\t15","Ej:\nPintura Acrílica 18L\t150.00\t250.00\t20\nMasilla\t35.00\t70.00\t15","Ex:\nAcrylic Paint 18L\t150.00\t250.00\t20\nWall Putty\t35.00\t70.00\t15") : tx("Ex:\nJoão da Silva\t048.912.839-44\t45 99841-2233\nConstrutora Alfa\t80054231-4","Ej:\nJuan Silva\t048.912.839-44\t45 99841-2233\nConstructora Alfa\t80054231-4","Ex:\nJohn Smith\t048.912.839-44\t45 99841-2233\nAlpha Construction\t80054231-4")} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', padding: '16px', color: '#34d399', fontFamily: 'monospace', fontSize: '14px', outline: 'none', marginBottom: '16px', boxSizing: 'border-box' }} />

      {mensagemSucesso && <div style={{ padding: '14px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399', borderRadius: '10px', marginBottom: '16px', fontWeight: 800 }}>{mensagemSucesso}</div>}

      <button onClick={importarDadosEmMassa} style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '15px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}>
        🚀 Processar e Carregar no Zenos OS
      </button>
    </div>
  );
}