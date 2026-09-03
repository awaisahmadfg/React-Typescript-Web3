import Config from 'config/config';
import RoyaltyCoinABI from 'contract/RoyaltyCoin.json';
import { BigNumber, ethers } from 'ethers';
import { useCallback, useEffect, useMemo, useState } from 'react';

const BPS = 10_000;
const RC_DECIMALS = 18;
const PERCENT_SCALE = 100;

const provider = new ethers.providers.StaticJsonRpcProvider(Config.INFURA_URL);
const rcContract = new ethers.Contract(
  Config.IDEACOIN_CONTRACT_ADDRESS,
  RoyaltyCoinABI,
  provider
);

export type RcRewardPoolState = {
  rewardsSupply: BigNumber;
  totalRewardsDistributed: BigNumber;
  rewardsRemaining: BigNumber;
  mindminerFeeBps: BigNumber;
  liquidityFeeBps: BigNumber;
  maxSingleDistribution: BigNumber;
  poolDepletionPercent: number;
};

export type RcRewardPreview = {
  requestedAmount: string;
  userReceives: string;
  mindminerFee: string;
  liquidityFee: string;
  totalFromPool: string;
  requestedAmountWei: BigNumber;
  userReceivesWei: BigNumber;
  mindminerFeeWei: BigNumber;
  liquidityFeeWei: BigNumber;
  totalFromPoolWei: BigNumber;
  canDistribute: boolean;
  error?: string;
};

type FeeBpsOverride = {
  mindminerFeeBps?: BigNumber;
  liquidityFeeBps?: BigNumber;
};

type ParsedAmount = {
  requestedStr: string;
  requestedWei: BigNumber;
};

const formatRc = (value: BigNumber): string =>
  ethers.utils.formatUnits(value, RC_DECIMALS);

const previewError = (
  requestedAmount: string,
  requestedAmountWei: BigNumber,
  error: string
): RcRewardPreview => ({
  requestedAmount,
  userReceives: '0',
  mindminerFee: '0',
  liquidityFee: '0',
  totalFromPool: '0',
  requestedAmountWei,
  userReceivesWei: BigNumber.from(0),
  mindminerFeeWei: BigNumber.from(0),
  liquidityFeeWei: BigNumber.from(0),
  totalFromPoolWei: BigNumber.from(0),
  canDistribute: false,
  error
});

const parseRequestedAmount = (
  requestedAmount: string | number
): ParsedAmount | null => {
  const requestedStr = String(requestedAmount).trim();
  if (!requestedStr) {
    return null;
  }

  try {
    const requestedWei = ethers.utils.parseUnits(requestedStr, RC_DECIMALS);
    return { requestedStr, requestedWei };
  } catch {
    return null;
  }
};

const getRequestedAmountError = (
  pool: RcRewardPoolState,
  requestedWei: BigNumber
): string | null => {
  if (requestedWei.lte(0)) {
    return 'Amount must be greater than zero.';
  }
  if (pool.totalRewardsDistributed.gte(pool.rewardsSupply)) {
    return 'All RoyaltyCoin rewards have already been distributed.';
  }
  if (requestedWei.gt(pool.maxSingleDistribution)) {
    return 'Amount exceeds the maximum single distribution (1,000,000 RC).';
  }

  return null;
};

const getDistributionError = (
  pool: RcRewardPoolState,
  adjustedAmount: BigNumber,
  mindminerPortion: BigNumber,
  liquidityPortion: BigNumber,
  totalFromPool: BigNumber,
  mindminerFeeBps: BigNumber,
  liquidityFeeBps: BigNumber
): string | null => {
  if (adjustedAmount.isZero()) {
    return 'Adjusted reward is too low after pool scaling.';
  }
  if (mindminerFeeBps.gt(0) && mindminerPortion.isZero()) {
    return 'MindMiner fee portion rounds to zero for this amount.';
  }
  if (liquidityFeeBps.gt(0) && liquidityPortion.isZero()) {
    return 'Liquidity fee portion rounds to zero for this amount.';
  }
  if (totalFromPool.gt(pool.rewardsRemaining)) {
    return 'Total distribution exceeds remaining rewards pool.';
  }
  if (pool.totalRewardsDistributed.add(totalFromPool).gt(pool.rewardsSupply)) {
    return 'Total distribution would exceed the rewards pool supply.';
  }

  return null;
};

export const fetchRcRewardPoolState = async (): Promise<RcRewardPoolState> => {
  const [
    rewardsSupply,
    totalRewardsDistributed,
    rewardsRemaining,
    mindminerFeeBps,
    liquidityFeeBps,
    maxSingleDistribution
  ] = await Promise.all([
    rcContract.REWARDS_SUPPLY(),
    rcContract.totalRewardsDistributed(),
    rcContract.remainingSupply(),
    rcContract.MINDMINER_FEE_BPS(),
    rcContract.LIQUIDITY_FEE_BPS(),
    rcContract.MAX_SINGLE_DISTRIBUTION()
  ]);

  const poolDepletionPercent = rewardsSupply.isZero()
    ? 0
    : Number(totalRewardsDistributed.mul(PERCENT_SCALE).div(rewardsSupply));

  return {
    rewardsSupply,
    totalRewardsDistributed,
    rewardsRemaining,
    mindminerFeeBps,
    liquidityFeeBps,
    maxSingleDistribution,
    poolDepletionPercent
  };
};

/** Mirrors `RoyaltyCoin.distributeRoyaltyCoinReward` — user gets `userReceives`. */
export const calculateRcRewardPreview = (
  requestedAmount: string | number,
  pool: RcRewardPoolState,
  feeBps?: FeeBpsOverride
): RcRewardPreview | null => {
  const parsed = parseRequestedAmount(requestedAmount);
  if (!parsed) {
    return null;
  }

  const { requestedStr, requestedWei } = parsed;
  const mindminerFeeBps = feeBps?.mindminerFeeBps ?? pool.mindminerFeeBps;
  const liquidityFeeBps = feeBps?.liquidityFeeBps ?? pool.liquidityFeeBps;
  const adjustedAmount = requestedWei
    .mul(pool.rewardsRemaining)
    .div(pool.rewardsSupply);
  const mindminerPortion = adjustedAmount.mul(mindminerFeeBps).div(BPS);
  const liquidityPortion = adjustedAmount.mul(liquidityFeeBps).div(BPS);
  const totalFromPool = adjustedAmount
    .add(mindminerPortion)
    .add(liquidityPortion);

  const requestedAmountError = getRequestedAmountError(pool, requestedWei);
  if (requestedAmountError) {
    return previewError(requestedStr, requestedWei, requestedAmountError);
  }

  const distributionError = getDistributionError(
    pool,
    adjustedAmount,
    mindminerPortion,
    liquidityPortion,
    totalFromPool,
    mindminerFeeBps,
    liquidityFeeBps
  );

  if (distributionError) {
    return previewError(requestedStr, requestedWei, distributionError);
  }

  return {
    requestedAmount: requestedStr,
    userReceives: formatRc(adjustedAmount),
    mindminerFee: formatRc(mindminerPortion),
    liquidityFee: formatRc(liquidityPortion),
    totalFromPool: formatRc(totalFromPool),
    requestedAmountWei: requestedWei,
    userReceivesWei: adjustedAmount,
    mindminerFeeWei: mindminerPortion,
    liquidityFeeWei: liquidityPortion,
    totalFromPoolWei: totalFromPool,
    canDistribute: true
  };
};

export const previewRcRewardForAmount = async (
  requestedAmount: string | number,
  feeBps?: FeeBpsOverride
): Promise<RcRewardPreview | null> => {
  const pool = await fetchRcRewardPoolState();
  return calculateRcRewardPreview(requestedAmount, pool, feeBps);
};

export const useRcRewardPreview = (requestedAmount: string) => {
  const [pool, setPool] = useState<RcRewardPoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setPool(await fetchRcRewardPoolState());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load RC reward pool state'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const preview = useMemo(
    () => (pool ? calculateRcRewardPreview(requestedAmount, pool) : null),
    [requestedAmount, pool]
  );

  return { preview, pool, loading, error, refresh };
};
