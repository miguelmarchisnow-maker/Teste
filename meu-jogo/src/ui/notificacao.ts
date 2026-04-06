const MAX_NOTIFICACOES = 5;
const DURACAO_MS = 4000;
const FADE_MS = 500;

interface Notificacao {
  el: HTMLDivElement;
  criadoEm: number;
}

let _container: HTMLDivElement | null = null;
const _notificacoes: Notificacao[] = [];

function garantirContainer(): HTMLDivElement {
  if (_container) return _container;

  _container = document.createElement('div');
  Object.assign(_container.style, {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: '9998',
    pointerEvents: 'none',
    fontFamily: 'monospace',
    maxWidth: '360px',
  });
  document.body.appendChild(_container);
  return _container;
}

export function mostrarNotificacao(texto: string, cor: string = '#60ccff'): void {
  const container = garantirContainer();

  const el = document.createElement('div');
  Object.assign(el.style, {
    background: 'rgba(8, 14, 26, 0.92)',
    border: `1px solid ${cor}40`,
    borderLeft: `3px solid ${cor}`,
    borderRadius: '4px',
    padding: '8px 14px',
    fontSize: '11px',
    color: '#a0d8b0',
    transition: 'opacity 0.5s, transform 0.3s',
    opacity: '0',
    transform: 'translateX(-20px)',
  });
  el.textContent = texto;
  container.appendChild(el);

  // Animar entrada
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(0)';
  });

  const notif: Notificacao = { el, criadoEm: performance.now() };
  _notificacoes.push(notif);

  // Limitar quantidade
  while (_notificacoes.length > MAX_NOTIFICACOES) {
    const old = _notificacoes.shift()!;
    old.el.remove();
  }

  // Auto-remover
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-20px)';
    setTimeout(() => {
      el.remove();
      const idx = _notificacoes.indexOf(notif);
      if (idx >= 0) _notificacoes.splice(idx, 1);
    }, FADE_MS);
  }, DURACAO_MS);
}

// === Notificações pré-definidas ===

export function notifConstrucaoCompleta(tipo: string, tier: number): void {
  const nome = tipo === 'fabrica' ? 'Fabrica' : 'Infraestrutura';
  mostrarNotificacao(`${nome} T${tier} construida!`, '#ffb347');
}

export function notifPesquisaCompleta(categoria: string, tier: number): void {
  const nomes: Record<string, string> = {
    torreta: 'Torreta',
    cargueira: 'Cargueira',
    batedora: 'Batedora',
  };
  mostrarNotificacao(`Pesquisa: ${nomes[categoria] || categoria} T${tier} completa!`, '#aa66ff');
}

export function notifColonizacao(): void {
  mostrarNotificacao('Planeta colonizado!', '#60ff90');
}

export function notifNaveProducida(tipo: string, tier: number): void {
  const nome = tipo === 'colonizadora' ? 'Colonizadora' : `${tipo} T${tier}`;
  mostrarNotificacao(`${nome} produzida!`, '#60ccff');
}
