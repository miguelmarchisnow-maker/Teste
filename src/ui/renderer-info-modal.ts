import type { Application } from 'pixi.js';

interface RendererInfo {
  motor: string;
  versao: string;
  gpu: string;
  vendor: string;
  driver?: string;
  maxTextureSize?: number;
  maxVertexAttribs?: number;
  maxUniformVectors?: number;
  extensions?: string[];
  features?: string[];
  limits?: Record<string, unknown>;
  software: boolean;
  bloqueado: boolean;
}

let _container: HTMLDivElement | null = null;
let _styleInjected = false;

function injectStyles(): void {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .renderer-info-overlay {
      position: fixed; inset: 0; z-index: 700;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--hud-font); color: var(--hud-text);
    }
    .renderer-info-card {
      background: var(--hud-bg);
      border: 1px solid var(--hud-border);
      padding: calc(var(--hud-unit) * 1.4);
      min-width: calc(var(--hud-unit) * 28);
      max-width: calc(var(--hud-unit) * 36);
      max-height: 80vh;
      overflow-y: auto;
    }
    .renderer-info-title {
      font-family: var(--hud-font-display);
      font-size: calc(var(--hud-unit) * 1.4);
      letter-spacing: 0.12em; text-transform: uppercase;
      margin: 0 0 calc(var(--hud-unit) * 0.8);
    }
    .renderer-info-row {
      display: flex; justify-content: space-between; gap: calc(var(--hud-unit) * 1);
      padding: calc(var(--hud-unit) * 0.25) 0;
      font-size: calc(var(--hud-unit) * 0.8);
    }
    .renderer-info-row .label { color: var(--hud-text-dim); letter-spacing: 0.05em; }
    .renderer-info-row .value { color: var(--hud-text); text-align: right; font-family: monospace; word-break: break-word; }
    .renderer-info-section { font-family: var(--hud-font-display); font-size: calc(var(--hud-unit) * 0.75); letter-spacing: 0.1em; text-transform: uppercase; color: var(--hud-text-dim); margin-top: calc(var(--hud-unit) * 1); padding-top: calc(var(--hud-unit) * 0.4); border-top: 1px solid var(--hud-border); }
    .renderer-info-banner {
      margin-top: calc(var(--hud-unit) * 1);
      padding: calc(var(--hud-unit) * 0.8);
      border: 1px solid; font-size: calc(var(--hud-unit) * 0.75);
    }
    .renderer-info-banner.ok { border-color: #5fbd6f; color: #5fbd6f; }
    .renderer-info-banner.warn { border-color: #ff6b6b; color: #ff6b6b; }
    .renderer-info-banner.info { border-color: var(--hud-text-dim); color: var(--hud-text-dim); }
    .renderer-info-ext-list {
      display: none; margin-top: calc(var(--hud-unit) * 0.4);
      font-family: monospace; font-size: calc(var(--hud-unit) * 0.65);
      max-height: 200px; overflow-y: auto;
      border: 1px solid var(--hud-border); padding: calc(var(--hud-unit) * 0.4);
    }
    .renderer-info-ext-list.show { display: block; }
    .renderer-info-close {
      display: block; margin: calc(var(--hud-unit) * 1) auto 0; padding: calc(var(--hud-unit) * 0.5) calc(var(--hud-unit) * 1.5);
      background: var(--hud-bg); border: 1px solid var(--hud-border); color: var(--hud-text);
      font-family: var(--hud-font); cursor: pointer;
    }
  `;
  document.head.appendChild(s);
}

function extrairDriver(gpuString: string): string | undefined {
  const m = gpuString.match(/ANGLE \(([^)]+)\)/);
  return m?.[1];
}

function coletarInfoWebGL(renderer: any): RendererInfo {
  const gl: WebGLRenderingContext | WebGL2RenderingContext | null = renderer?.gl ?? null;
  if (!gl) {
    return { motor: 'WebGL', versao: 'desconhecido', gpu: 'desconhecido', vendor: 'desconhecido', software: false, bloqueado: true };
  }
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext
    ? ((gl.getParameter((ext as any).UNMASKED_RENDERER_WEBGL) as string) || 'desconhecido')
    : 'bloqueado pelo navegador';
  const vendor = ext
    ? ((gl.getParameter((ext as any).UNMASKED_VENDOR_WEBGL) as string) || 'desconhecido')
    : 'bloqueado pelo navegador';
  const versao = (gl.getParameter(gl.VERSION) as string) ?? 'desconhecido';
  const software = ext ? /swiftshader|llvmpipe|software|basic render/i.test(gpu) : false;
  return {
    motor: versao.includes('2.0') ? 'WebGL 2' : 'WebGL 1',
    versao,
    gpu,
    vendor,
    driver: ext ? extrairDriver(gpu) : undefined,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number,
    maxUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number,
    extensions: gl.getSupportedExtensions() ?? [],
    software,
    bloqueado: !ext,
  };
}

function coletarInfoWebGPU(renderer: any): RendererInfo {
  const adapter = (renderer as any)?.adapter ?? null;
  const info = (adapter as any)?.info ?? {};
  const device = info.device || 'desconhecido';
  const vendor = info.vendor || 'desconhecido';
  const architecture = info.architecture || '';
  return {
    motor: 'WebGPU',
    versao: 'WebGPU 1.0',
    gpu: device,
    vendor,
    driver: architecture || undefined,
    features: adapter?.features ? Array.from(adapter.features as Iterable<string>) : [],
    limits: adapter?.limits ? Object.fromEntries(Object.entries(adapter.limits)) : {},
    software: /software|fallback/i.test(architecture),
    bloqueado: !adapter,
  };
}

function coletarInfo(app: Application): RendererInfo {
  const renderer = app.renderer as any;
  const nome = (renderer?.name ?? '').toLowerCase();
  if (nome.includes('webgpu')) {
    return coletarInfoWebGPU(renderer);
  }
  return coletarInfoWebGL(renderer);
}

function row(label: string, value: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'renderer-info-row';
  const l = document.createElement('span');
  l.className = 'label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'value';
  v.textContent = value;
  el.append(l, v);
  return el;
}

export function abrirRendererInfoModal(app: Application): void {
  injectStyles();
  if (_container) return;
  const info = coletarInfo(app);

  const overlay = document.createElement('div');
  overlay.className = 'renderer-info-overlay';
  overlay.setAttribute('data-ui', 'true');
  overlay.style.pointerEvents = 'auto';

  const card = document.createElement('div');
  card.className = 'renderer-info-card';
  overlay.appendChild(card);

  const title = document.createElement('h2');
  title.className = 'renderer-info-title';
  title.textContent = 'Informações do Renderer';
  card.appendChild(title);

  card.append(row('Motor', info.motor));
  card.append(row('Versão', info.versao));
  card.append(row('GPU', info.gpu));
  card.append(row('Vendor', info.vendor));
  if (info.driver) card.append(row('Driver', info.driver));

  if (info.maxTextureSize || info.maxVertexAttribs || info.extensions) {
    const sec = document.createElement('div');
    sec.className = 'renderer-info-section';
    sec.textContent = 'Capacidades';
    card.appendChild(sec);
    if (info.maxTextureSize) card.append(row('Tamanho máx textura', String(info.maxTextureSize)));
    if (info.maxVertexAttribs) card.append(row('Vertex attribs', String(info.maxVertexAttribs)));
    if (info.maxUniformVectors) card.append(row('Uniform vectors', String(info.maxUniformVectors)));
    if (info.extensions && info.extensions.length > 0) {
      const extRow = row('Extensions', `${info.extensions.length} ativas`);
      const btn = document.createElement('button');
      btn.textContent = 'Ver ▼';
      btn.style.cssText = 'background:transparent;border:1px solid var(--hud-border);color:var(--hud-text-dim);cursor:pointer;padding:1px 6px;margin-left:6px;font-size:10px;';
      extRow.querySelector('.value')?.appendChild(btn);
      card.appendChild(extRow);
      const list = document.createElement('div');
      list.className = 'renderer-info-ext-list';
      list.textContent = info.extensions.join('\n');
      card.appendChild(list);
      btn.addEventListener('click', () => {
        list.classList.toggle('show');
        btn.textContent = list.classList.contains('show') ? 'Ocultar ▲' : 'Ver ▼';
      });
    }
  }

  if (info.features && info.features.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'renderer-info-section';
    sec.textContent = 'Features (WebGPU)';
    card.appendChild(sec);
    card.append(row('Count', String(info.features.length)));
  }

  if (info.software) {
    const b = document.createElement('div');
    b.className = 'renderer-info-banner warn';
    b.textContent = '⚠ Rodando em software — jogo vai travar. Habilite aceleração por hardware no navegador.';
    card.appendChild(b);
  } else if (info.bloqueado) {
    const b = document.createElement('div');
    b.className = 'renderer-info-banner info';
    b.textContent = 'ℹ Detalhes da GPU não disponíveis — seu navegador bloqueia info detalhada por privacidade (Safari, Firefox com resistFingerprinting, ou navegação privada).';
    card.appendChild(b);
  } else {
    const b = document.createElement('div');
    b.className = 'renderer-info-banner ok';
    b.textContent = '✓ Aceleração por hardware ativa';
    card.appendChild(b);
  }

  const close = document.createElement('button');
  close.className = 'renderer-info-close';
  close.textContent = 'Fechar';
  close.addEventListener('click', () => fecharRendererInfoModal());
  card.appendChild(close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharRendererInfoModal();
  });
  window.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      fecharRendererInfoModal();
      window.removeEventListener('keydown', esc);
    }
  });

  document.body.appendChild(overlay);
  _container = overlay;
}

export function fecharRendererInfoModal(): void {
  _container?.remove();
  _container = null;
}
