import React from 'react';

export default class FiscalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error:null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ZenOS Fiscal] Falha isolada na interface fiscal.', {
      message:error?.message || String(error),
      componentStack:info?.componentStack || null,
    });
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error:null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section role="alert" style={{padding:24,border:'1px solid #e11d48',borderRadius:18,background:'#2e0a16',color:'#fff'}}>
      <strong style={{display:'block',fontSize:18}}>Fiscal indisponível</strong>
      <p style={{color:'#fecdd3',lineHeight:1.5}}>Uma falha fiscal foi isolada. O restante do ZenOS continua disponível.</p>
      <button type="button" onClick={this.props.onVoltar} style={{minHeight:42,padding:'9px 14px',border:0,borderRadius:10,background:'#e11d48',color:'#fff',fontWeight:900,cursor:'pointer'}}>Voltar ao painel</button>
    </section>;
  }
}

