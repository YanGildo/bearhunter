// Módulo "Operadores": rastreia carteiras de um operador (marcadores, auxiliares, fazenda)
// e gera sinais próprios, separados dos alertas de volume.

export type WalletRole = 'marcador' | 'auxiliar' | 'fazenda';

export const ROLE_META: Record<WalletRole, { label: string; hint: string }> = {
  marcador: { label: 'Marcador', hint: 'Compra logo no lançamento (ex.: 8c3ss). Uma compra dele = lançamento do operador.' },
  auxiliar: { label: 'Auxiliar', hint: 'Opera junto em fases. Compra também conta como entrada.' },
  fazenda: { label: 'Fazenda', hint: 'Acumula e despeja junto. Várias vendendo ao mesmo tempo = despejo.' },
};

export interface OperatorWallet {
  address: string;
  label: string;
  role: WalletRole;
  active: boolean;
  addedAt: number;
  lastActivityAt: number | null;
  lastSignature: string | null;
}

export type SignalKind =
  | 'entrada'
  | 'fazenda'
  | 'despejo'
  | 'transferencia'
  | 'migracao_rapida'
  | 'bundle'
  | 'bots_off'
  | 'bots_on';

export const SIGNAL_META: Record<SignalKind, { label: string; tone: 'up' | 'down' | 'warn' | 'info' }> = {
  entrada: { label: 'ENTRADA', tone: 'up' },
  fazenda: { label: 'FAZENDA', tone: 'info' },
  despejo: { label: 'DESPEJO', tone: 'down' },
  transferencia: { label: 'TRANSFERÊNCIA', tone: 'warn' },
  migracao_rapida: { label: 'MIGRAÇÃO RÁPIDA', tone: 'up' },
  bundle: { label: 'BUNDLE', tone: 'up' },
  bots_off: { label: 'BOTS OFF', tone: 'warn' },
  bots_on: { label: 'BOTS ON', tone: 'info' },
};

/** Sinais que só indicam "pode ser o operador" (sem carteira da lista envolvida). */
export const CANDIDATE_KINDS: SignalKind[] = ['bundle', 'migracao_rapida', 'bots_off', 'bots_on'];

export interface OperatorSignal {
  id: string;
  kind: SignalKind;
  at: number;
  mint: string | null;
  symbol: string | null;
  wallets: string[];
  text: string;
  mcap: number | null;
  signature: string | null;
}

export interface WalletPosition {
  role: WalletRole;
  boughtSol: number;
  soldSol: number;
  buys: number;
  sells: number;
  lastAt: number;
}

export interface OperatorToken {
  mint: string;
  symbol: string | null;
  firstSeenAt: number;
  reason: SignalKind;
  createdAt: number | null;
  migratedAt: number | null;
  wallets: Record<string, WalletPosition>;
  botsState: 'on' | 'off' | null;
  lastSignalAt: number;
}

export interface OperatorSettings {
  enabled: boolean;
  dumpMinWallets: number;
  dumpWindowS: number;
  fastMigrationMaxS: number;
  bundleMaxAgeS: number;
  bundleMinAvgBuyUsd: number;
  transferMinPctSupply: number;
  botsOffRatio: number;
  soundId: string | null;
  dumpSoundId: string | null;
  volume: number;
  notify: boolean;
  detectFastMigration: boolean;
  detectBundle: boolean;
  soundOnCandidates: boolean;
}

export interface ConfirmedToken {
  at: number;
  symbol: string | null;
  note: string;
}

export interface OperatorState {
  confirmed: Record<string, ConfirmedToken>; // tokens que você confirmou como dele
  discarded: Record<string, number>; // tokens que você disse que NÃO são dele (ficam ocultos)
  wallets: OperatorWallet[];
  signals: OperatorSignal[];
  tokens: Record<string, OperatorToken>;
  settings: OperatorSettings;
  unread: number;
}

export const DEFAULT_OPERATOR_SETTINGS: OperatorSettings = {
  enabled: true,
  dumpMinWallets: 3,
  dumpWindowS: 10,
  fastMigrationMaxS: 360,
  bundleMaxAgeS: 180,
  bundleMinAvgBuyUsd: 500,
  transferMinPctSupply: 1,
  botsOffRatio: 0.3,
  soundId: 'builtin:operator',
  dumpSoundId: 'builtin:operator-dump',
  volume: 0.8,
  notify: true,
  detectFastMigration: true,
  detectBundle: true,
  soundOnCandidates: false,
};

export const EMPTY_OPERATOR_STATE: OperatorState = {
  confirmed: {},
  discarded: {},
  wallets: [],
  signals: [],
  tokens: {},
  settings: DEFAULT_OPERATOR_SETTINGS,
  unread: 0,
};

export const MAX_OPERATOR_WALLETS = 150;
