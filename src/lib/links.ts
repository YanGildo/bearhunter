export const dexUrl = (token: string, pair?: string | null) => `https://dexscreener.com/solana/${pair ?? token}`;
export const gmgnUrl = (token: string) => `https://gmgn.ai/sol/token/${token}`;
export const xSearchUrl = (token: string) => `https://x.com/search?q=${encodeURIComponent(token)}&f=live`;
export const chartEmbedUrl = (token: string, pair?: string | null) =>
  `https://dexscreener.com/solana/${pair ?? token}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=1&chartTheme=dark&theme=dark&chartStyle=1&chartType=marketCap&interval=1`;

export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}
