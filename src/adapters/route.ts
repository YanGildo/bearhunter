// Rota de rede por fonte: direta ou pelo Cloudflare (Pages Functions em functions/).
// "auto": começa direto; depois de 2 falhas seguidas sem nenhum sucesso, alterna de rota.
export type RouteMode = 'auto' | 'direct' | 'proxy';

/** Origem do site publicado (proxy disponível) ou null em localhost / sem janela. */
export function proxyOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return null;
  return window.location.origin;
}

export class Route {
  private current: 'direct' | 'proxy' = 'direct';
  private fails = 0;
  constructor(private getMode: () => RouteMode = () => 'auto') {}

  /** Qual rota usar agora. */
  pick(): 'direct' | 'proxy' {
    const mode = this.getMode();
    if (!proxyOrigin()) return 'direct';
    if (mode === 'direct' || mode === 'proxy') return mode;
    return this.current;
  }
  ok() {
    this.fails = 0;
  }
  fail() {
    this.fails++;
    if (this.getMode() === 'auto' && proxyOrigin() && this.fails >= 2) {
      this.current = this.current === 'direct' ? 'proxy' : 'direct';
      this.fails = 0;
    }
  }
  /** Força a próxima tentativa pela outra rota (botão "Reconectar"). */
  flip() {
    if (this.getMode() === 'auto' && proxyOrigin()) this.current = this.current === 'direct' ? 'proxy' : 'direct';
    this.fails = 0;
  }
  label() {
    return this.pick() === 'proxy' ? 'via Cloudflare' : 'direta';
  }
}

export function wsOrigin(origin: string) {
  return origin.replace(/^http/, 'ws');
}
