import { Link } from 'react-router';
import {
  Zap, ArrowLeft, MessageCircle, Brain, LayoutDashboard,
  FileCheck, History, BarChart2, Users, Bell, ArrowRight,
  Upload, Search, Filter, CheckCircle2, Clock, AlertCircle,
  Building2, FileText, CalendarClock, Sparkles,
} from 'lucide-react';

const STEPS = [
  {
    n: '01',
    title: 'Cadastro de Clientes',
    desc: 'Cadastre seus clientes com dados básicos: nome da empresa, responsável, WhatsApp, e-mail, regime tributário e status.',
    icon: Users,
  },
  {
    n: '02',
    title: 'Documentos Obrigatórios',
    desc: 'Defina quais documentos cada cliente deve enviar mensalmente — notas fiscais, extratos, folha de pagamento, relatórios e mais.',
    icon: FileText,
  },
  {
    n: '03',
    title: 'Geração Automática de Pendências',
    desc: 'No início de cada período, o sistema cria automaticamente todas as pendências dos clientes, já com status "Pendente".',
    icon: CalendarClock,
  },
  {
    n: '04',
    title: 'Cobrança Automática via WhatsApp',
    desc: 'Mensagens automáticas são enviadas aos clientes nos horários programados, lembrando sobre documentos pendentes.',
    icon: MessageCircle,
  },
  {
    n: '05',
    title: 'Recebimento dos Arquivos',
    desc: 'O cliente envia PDF, imagem, Excel ou ZIP diretamente pelo WhatsApp. O sistema recebe e armazena automaticamente.',
    icon: Upload,
  },
  {
    n: '06',
    title: 'Identificação por IA',
    desc: 'A inteligência artificial analisa o arquivo, identifica tipo, empresa, competência e inconsistências, atualizando a pendência automaticamente.',
    icon: Brain,
  },
  {
    n: '07',
    title: 'Dashboard do Escritório',
    desc: 'Visão completa de todos os clientes: quem está em dia, quem tem pendências, documentos vencidos e gráficos de evolução.',
    icon: LayoutDashboard,
  },
  {
    n: '08',
    title: 'Central de Pendências',
    desc: 'Tela principal com filtros por cliente, status, documento, competência e responsável. Ações rápidas de cobrança e alteração de status.',
    icon: Filter,
  },
  {
    n: '09',
    title: 'Histórico Completo',
    desc: 'Toda interação registrada: mensagens enviadas, arquivos recebidos, alterações de status, usuário responsável, data e hora.',
    icon: History,
  },
  {
    n: '10',
    title: 'Relatórios Gerenciais',
    desc: 'Clientes mais atrasados, documentos mais esquecidos, tempo médio de entrega, eficiência da equipe e taxa de resposta.',
    icon: BarChart2,
  },
];

const HIGHLIGHTS = [
  {
    icon: MessageCircle,
    title: 'WhatsApp Integrado',
    desc: 'Cobranças automáticas e recebimento de arquivos diretamente no WhatsApp do cliente.',
  },
  {
    icon: Brain,
    title: 'Inteligência Artificial',
    desc: 'IA identifica e classifica documentos automaticamente, reduzindo trabalho manual.',
  },
  {
    icon: Bell,
    title: 'Alertas em Tempo Real',
    desc: 'Notificações imediatas quando documentos são recebidos ou pendências vencem.',
  },
  {
    icon: Building2,
    title: 'Multiescritório',
    desc: 'Gerencie múltiplos escritórios e centenas de clientes em um único painel centralizado.',
  },
  {
    icon: FileCheck,
    title: 'Controle Total',
    desc: 'Acompanhe cada documento, de cada cliente, em cada competência, sem perder nada.',
  },
  {
    icon: Search,
    title: 'Busca e Filtros Avançados',
    desc: 'Encontre qualquer pendência em segundos com filtros por status, prazo e responsável.',
  },
];

const STATUSES = [
  { label: 'Recebido', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  { label: 'Em análise', color: 'bg-purple-500/15 text-purple-400 border-purple-500/20', icon: Brain },
  { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20', icon: Clock },
  { label: 'Rejeitado', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: AlertCircle },
];

export default function PendixLanding() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-gray-200 font-sans selection:bg-purple-500/30">

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-20 flex items-center justify-between px-6 md:px-10 bg-[#0d0d0d]/90 backdrop-blur-xl border-b border-white/5">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)] border border-orange-300/50">
            <Zap size={18} className="text-white fill-white" />
          </div>
          <span className="text-2xl font-black tracking-tighter uppercase text-white">FLASH</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
            <Sparkles size={10} />
            Módulo Pendix
          </div>
          <Link
            to="/modulos"
            className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors ml-4"
          >
            <ArrowLeft size={14} />
            Módulos
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] bg-purple-900/12 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-800/8 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-8 py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full mb-8">
            <Sparkles size={11} />
            Gestão de Pendências
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white leading-none mb-6">
            Pendências{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-violet-500">
              resolvidas
            </span>
            <br />
            sem esforço
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Automatize o controle de documentos dos seus clientes. O Pendix integra WhatsApp e Inteligência Artificial para que seu escritório nunca perca um prazo.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              to="/pendix/app"
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold px-8 py-4 rounded-full text-sm tracking-wide transition-colors shadow-[0_0_30px_rgba(124,58,237,0.3)]"
            >
              Começar agora <ArrowRight size={16} />
            </Link>
            <a
              href="#como-funciona"
              className="flex items-center gap-2 border border-white/20 hover:border-purple-500/40 hover:bg-purple-500/5 text-white font-medium px-8 py-4 rounded-full text-sm tracking-wide transition-colors"
            >
              Ver como funciona
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-10 border-t border-white/5">
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-black text-white">100%</p>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 uppercase tracking-widest">Automático</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-black text-white">IA</p>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 uppercase tracking-widest">Identificação docs</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-black text-white">0</p>
              <p className="text-[10px] md:text-xs text-gray-500 mt-1.5 uppercase tracking-widest">Cobranças manuais</p>
            </div>
          </div>
        </div>
      </section>

      {/* Status badges */}
      <section className="py-8 px-6 border-y border-white/5">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-3">
          {STATUSES.map(({ label, color, icon: Icon }) => (
            <div key={label} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-widest ${color}`}>
              <Icon size={12} />
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* Highlights */}
      <section className="py-24 px-6 md:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-4">Recursos</p>
            <h2 className="text-4xl font-black tracking-tighter text-white">Tudo que seu escritório precisa</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl border border-white/8 bg-white/3 hover:border-purple-500/25 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                  <Icon size={18} className="text-purple-400" />
                </div>
                <h3 className="text-sm font-black text-white tracking-tight mb-2">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-24 px-6 md:px-8 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/5 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-4">Fluxo</p>
            <h2 className="text-4xl font-black tracking-tighter text-white">Como o Pendix funciona</h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto text-sm leading-relaxed">
              Do cadastro até os relatórios, tudo automatizado em 10 etapas.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {STEPS.map(({ n, title, desc, icon: Icon }) => (
              <div key={n} className="flex gap-4 p-6 rounded-2xl border border-white/8 bg-white/3 hover:border-purple-500/20 transition-colors group">
                <div className="shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                    <Icon size={16} className="text-purple-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black text-purple-500/60 tracking-widest">{n}</span>
                    <h3 className="text-sm font-black text-white tracking-tight">{title}</h3>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WhatsApp highlight */}
      <section className="py-24 px-6 md:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="p-8 md:p-10 rounded-3xl border border-purple-500/20 bg-gradient-to-b from-purple-500/8 to-transparent">
            <div className="flex flex-col md:flex-row items-start gap-6 md:gap-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(124,58,237,0.3)]">
                <MessageCircle size={28} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black text-white tracking-tight mb-3">Cobrança via WhatsApp</h3>
                <p className="text-gray-400 leading-relaxed mb-6">
                  O Pendix envia mensagens automáticas e humanizadas para seus clientes, nos horários certos. O cliente responde com o arquivo diretamente pelo WhatsApp — sem apps extras, sem login, sem fricção.
                </p>
                <div className="p-4 rounded-xl bg-white/5 border border-white/8">
                  <p className="text-xs text-gray-400 mb-2 uppercase tracking-widest font-bold">Exemplo de mensagem</p>
                  <p className="text-sm text-gray-300 leading-relaxed italic">
                    "Olá João, identificamos que ainda não recebemos seu extrato bancário referente ao mês de junho. Por favor, envie o documento para prosseguirmos com o fechamento."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 md:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-4">Pronto para começar?</p>
          <h2 className="text-4xl font-black tracking-tighter text-white mb-4">
            Elimine as pendências<br />do seu escritório
          </h2>
          <p className="text-gray-500 mb-10 text-sm leading-relaxed max-w-md mx-auto">
            Automatize cobranças, receba documentos via WhatsApp e deixe a IA fazer o trabalho pesado.
          </p>
          <Link
            to="/pendix/app"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-bold px-10 py-4 rounded-full text-sm tracking-wide transition-all shadow-[0_4px_20px_rgba(124,58,237,0.35)]"
          >
            Acessar o Pendix <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 md:px-10 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
              <Zap size={12} className="text-white fill-white" />
            </div>
            <span className="text-lg font-black tracking-tighter uppercase text-white">FLASH</span>
            <span className="text-gray-600 text-xs">×</span>
            <span className="text-sm font-black text-purple-400 tracking-tighter">PENDIX</span>
          </div>
          <p className="text-xs text-gray-600 tracking-wider">
            © {new Date().getFullYear()} Flash. Todos os direitos reservados.
          </p>
          <Link to="/modulos" className="text-xs font-bold text-purple-400 hover:text-purple-300 tracking-widest uppercase transition-colors">
            Ver todos os módulos →
          </Link>
        </div>
      </footer>
    </div>
  );
}
