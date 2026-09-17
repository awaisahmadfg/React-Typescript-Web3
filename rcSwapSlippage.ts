import { NUMBERS, RC_SWAP_SLIPPAGE_STORAGE_KEY } from 'utilities/constants';

export const RC_SWAP_SLIPPAGE_PRESETS = [
  NUMBERS.RC_SWAP_SLIPPAGE_PRESET_TENTH,
  NUMBERS.RC_SWAP_SLIPPAGE_PRESET_HALF,
  NUMBERS.RC_SWAP_SLIPPAGE_PRESET_ONE
] as const;

function isAllowedSlippagePreset(percent: number): boolean {
  return (RC_SWAP_SLIPPAGE_PRESETS as readonly number[]).includes(percent);
}

export function slippagePercentToBps(percent: number): number {
  const clamped = Math.min(
    Math.max(percent, NUMBERS.ZERO),
    NUMBERS.RC_SWAP_MAX_SLIPPAGE_PERCENT
  );
  return Math.round(clamped * NUMBERS.TEN * NUMBERS.TEN);
}

export function formatSlippagePercent(percent: number): string {
  if (Number.isInteger(percent)) {
    return String(percent);
  }
  return String(percent);
}

export function loadRcSwapSlippagePercent(): number {
  if (typeof window === 'undefined') {
    return NUMBERS.RC_SWAP_DEFAULT_SLIPPAGE_PERCENT;
  }
  try {
    const raw = window.localStorage.getItem(RC_SWAP_SLIPPAGE_STORAGE_KEY);
    if (raw === null) {
      return NUMBERS.RC_SWAP_DEFAULT_SLIPPAGE_PERCENT;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || !isAllowedSlippagePreset(parsed)) {
      return NUMBERS.RC_SWAP_DEFAULT_SLIPPAGE_PERCENT;
    }
    return parsed;
  } catch {
    return NUMBERS.RC_SWAP_DEFAULT_SLIPPAGE_PERCENT;
  }
}

export function saveRcSwapSlippagePercent(percent: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(RC_SWAP_SLIPPAGE_STORAGE_KEY, String(percent));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isSlippageHigh(percent: number): boolean {
  return percent > NUMBERS.RC_SWAP_SLIPPAGE_WARN_PERCENT;
}
