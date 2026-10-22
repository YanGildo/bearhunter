import type { DiscoverySource, MarketObservation, TokenMeta } from '@/domain/types';

/** O que uma fonte entrega de verdade. A UI usa isso para mostrar "—" em vez de inventar. */
export interface SourceCapabilities {
  discovery: boolean;
  migrations: boolean;
  marketData: boolean;
  windows: boolean; // entrega janelas 5m/1h/6h/24h prontas
  liquidity: 'always' | 'post_migration' | 'never';
  search: boolean;
}

export interface SourceHealth {
  id: string;
  label: string;
  state: 'idle' | 'connecting' | 'ok' | 'degraded' | 'error' | 'off';
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  detail: string | null;
  requestsLastMinute?: number;
}

export interface DiscoveredToken {
  address: string;
  source: DiscoverySource;
  name?: string | null;
  symbol?: string | null;
  imageUrl?: string | null;
  signature?: string | null;
  boostAmount?: number | null;
  /** link do metadado do token (PumpPortal, evento de criação) — usado para achar a foto */
  metadataUri?: string | null;
  at: number;
}

/** Fonte em stream (WebSocket): avisa tokens novos/migrados. */
export interface DiscoveryAdapter {
  id: string;
  capabilities: SourceCapabilities;
  start(onToken: (t: DiscoveredToken) => void): void;
  stop(): void;
  health(): SourceHealth;
}

export interface MarketFetchResult {
  observations: MarketObservation[];
  metas: TokenMeta[];
  missing: string[]; // endereços sem par encontrado
}

/** Fonte de mercado em lote (polling). */
export interface MarketAdapter {
  id: string;
  capabilities: SourceCapabilities;
  maxBatch: number;
  fetchTokens(addresses: string[], pinnedPairs?: Record<string, string>): Promise<MarketFetchResult>;
  listTrending(): Promise<DiscoveredToken[]>;
  search(query: string): Promise<{ observation: MarketObservation; meta: TokenMeta }[]>;
  health(): SourceHealth;
}
