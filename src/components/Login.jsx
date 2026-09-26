import { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validação extra de segurança para a confirmação de senha
    if (isRegistering && password !== confirmPassword) {
      alert("As senhas não coincidem. Por favor, verifique.");
      return;
    }

    if (isRegistering && password.length < 6) {
      alert("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    
    try {
      if (isRegistering) {
        // 1. Cria a conta no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Regista a loja no Firestore com status bloqueado/pendente
        await setDoc(doc(db, "lojas", user.uid), {
          email: email,
          status: "aguardando_pagamento",
          dataCadastro: new Date().toISOString()
        });
      } else {
        // 3. Efetua o login normal
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      console.error("Erro do Firebase:", error);
      let mensagemErro = error.message;
      if (error.code === 'auth/invalid-credential') {
        mensagemErro = 'E-mail ou senha incorretos.';
      } else if (error.code === 'auth/email-already-in-use') {
        mensagemErro = 'Este e-mail já está associado a outra loja.';
      } else if (error.code === 'auth/api-key-not-valid.') {
        mensagemErro = 'Chave de API inválida. Certifique-se de reiniciar o terminal (npm.cmd run dev) após configurar o .env.local.';
      }
      alert("Atenção: " + mensagemErro);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      
      {/* Banner de Fundo Profissional com Overlay Escuro */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center filter brightness-[0.35] scale-105 transition-transform duration-1000"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=2000&auto=format&fit=crop')` }}
      ></div>

      {/* Camada de Gradiente para dar profundidade e sofisticação */}
      <div className="absolute inset-0 z-0 bg-gradient-to-tr from-[#020617] via-[#020617]/80 to-indigo-950/40"></div>

      {/* Conteúdo Principal (Cartão Central) */}
      <div className="w-full max-w-md relative z-10">
        
        {/* Logotipo Zênite OS */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3 select-none">
            <div className="bg-white/90 backdrop-blur-md p-2.5 rounded-2xl flex items-center justify-center h-14 min-w-[56px] shadow-[0_0_30px_rgba(255,255,255,0.15)]">
              <img src="/Logo.png.jpeg" alt="Zênite" className="h-9 w-auto object-contain" onError={(e) => e.target.src = '/logo.png'} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-white font-black text-2xl tracking-[3px] drop-shadow-lg">ZÊNITE</span>
                <span className="text-indigo-400 font-extrabold text-sm tracking-widest">OS</span>
              </div>
              <span className="text-slate-300 text-[10px] font-bold tracking-[2px] uppercase mt-0.5 drop-shadow">
                Atacadão de Tintas & SaaS
              </span>
            </div>
          </div>
        </div>

        {/* Caixa de Vidro (Glassmorphism) */}
        <div className="bg-[#0b1120]/85 backdrop-blur-2xl border border-slate-700/60 rounded-3xl p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)]">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-black text-white mb-2">
              {isRegistering ? 'Criar Conta da Loja' : 'Acesso ao Sistema'}
            </h2>
            <p className="text-slate-400 text-xs font-medium">
              {isRegistering ? 'Insira os dados corporativos para iniciar' : 'Entre com as credenciais da sua licença'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                E-mail Corporativo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#020617]/90 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-sm"
                placeholder="loja@exemplo.com"
              />
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                Senha de Acesso
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#020617]/90 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-sm"
                placeholder="Mínimo de 6 caracteres"
              />
            </div>

            {/* Campo Extra: Confirmar Senha (Aparece apenas no registo) */}
            {isRegistering && (
              <div className="animate-fadeIn">
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                  Confirmar Senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-[#020617]/90 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium text-sm"
                  placeholder="Repita a senha escolhida"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-[0_4px_20px_rgba(79,70,229,0.4)] transition-all transform hover:scale-[1.01] active:scale-[0.99] mt-2 flex justify-center tracking-wide text-sm"
            >
              {loading ? 'A processar segurança...' : (isRegistering ? 'Concluir Cadastro da Loja' : 'Entrar no Painel')}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <p className="text-slate-400 text-xs">
              {isRegistering ? 'Já tem uma licença ativa?' : 'Quer expandir o seu negócio?'}
              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="ml-2 text-indigo-400 hover:text-indigo-300 font-bold underline decoration-indigo-400/30 underline-offset-4 transition-colors"
              >
                {isRegistering ? 'Fazer login' : 'Cadastre sua loja'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}