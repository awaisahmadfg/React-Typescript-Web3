import { useCallback, useEffect } from 'react';
import Config from 'config/config';
import pusher from 'config/pusherConfig';
import dataProvider from 'dataPrvider';
import { getRcSwapChainId } from 'helpers/rcSwapChain';
import { useDispatch } from 'react-redux';
import Actions from 'redux-state/actions';
import { setWalletData } from 'redux-state/rewards/actions';
import {
  GetOwnerBalance,
  GetRewardPoolThreshold,
  GetUser
} from 'redux-state/selectors';

const RC_REFETCH_DEBOUNCE_MS = 1500;

function getRcBalanceWalletAddress(
  user: ReturnType<typeof GetUser>
): string | undefined {
  const userId = user?.id;
  const company = user?.company;
  if (company?.walletAddress && userId) {
    const ownerId = company.owner?._id ?? company.owner;
    const isOwner =
      ownerId !== null &&
      ownerId !== undefined &&
      String(ownerId) === String(userId);
    const isLeaderOrEmployee = company.members?.some(
      (m) =>
        String(m?.profile?._id ?? m?.profile) === String(userId) &&
        (m?.role === 'leader' || m?.role === 'employee')
    );
    if (isOwner || isLeaderOrEmployee) {
      return company.walletAddress;
    }
  }
  return user?.walletAddress;
}

/**
 * Reward-pool Redux data (threshold, ops USDT, RC balance, price, progress).
 * Use when the header RC popup opens — not for the full wallet modal.
 *
 * Pass `enabled = false` to skip all fetches.
 */
export const useWalletData = (enabled = true) => {
  const dispatch = useDispatch();
  const user = GetUser();
  const rewardPoolThreshold = GetRewardPoolThreshold();
  const ownerBalance = GetOwnerBalance();

  const ideaBalanceAddress = getRcBalanceWalletAddress(user);

  const calculateThresholdStats = useCallback(
    (threshold: number, currentBalance: number) => {
      let pct = (currentBalance / threshold) * 100;
      pct = pct > 100 ? 100 : pct;
      const left = threshold - currentBalance;
      return {
        percentageMet: Math.floor(pct),
        coinsLeft: left > 0 ? left : 0
      };
    },
    []
  );

  // Threshold is independent of Infura — fetch once when enabled.
  useEffect(() => {
    if (!enabled) return;
    dispatch(Actions.getRewardPoolThreshold());
  }, [dispatch, enabled]);

  // Blockchain / price fetches run once per wallet (not again when threshold arrives).
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const fetchBalances = async () => {
      try {
        const chainId = getRcSwapChainId();
        const [opsUsdtData, ideaCoinPriceUsd, rcData] = await Promise.all([
          dataProvider
            .getUsdtBalance(Config.MINDMINER_OPS_WALLET_ADDRESS)
            .catch(() => null),
          dataProvider
            .getIdeaCoinPriceUsd(chainId, { fresh: true })
            .catch(() => 0),
          ideaBalanceAddress
            ? dataProvider
                .getRoyaltyCoinBalance(ideaBalanceAddress, chainId)
                .catch(() => null)
            : Promise.resolve(null)
        ]);

        if (cancelled) return;

        dispatch(
          setWalletData({
            ideaCoins: ideaBalanceAddress ? (rcData?.balance ?? 0) : undefined,
            ownerBalance: opsUsdtData?.balance,
            ideaCoinPriceUsd
          })
        );
      } catch (err) {
        console.error('useWalletData: unexpected error', err);
      }
    };

    fetchBalances();

    return () => {
      cancelled = true;
    };
  }, [dispatch, enabled, ideaBalanceAddress]);

  // Apply threshold math locally when threshold (or balance) becomes available —
  // no second Infura / ideaCoinPrice round-trip.
  useEffect(() => {
    if (!enabled) return;
    if (
      ownerBalance === undefined ||
      rewardPoolThreshold === undefined ||
      rewardPoolThreshold === null
    ) {
      return;
    }

    dispatch(
      setWalletData(calculateThresholdStats(rewardPoolThreshold, ownerBalance))
    );
  }, [
    calculateThresholdStats,
    dispatch,
    enabled,
    ownerBalance,
    rewardPoolThreshold
  ]);
};

/** Header RC badge only — no reward-pool threshold. */
export function useHeaderRcBalance(enabled: boolean) {
  const dispatch = useDispatch();
  const user = GetUser();
  const ideaBalanceAddress = getRcBalanceWalletAddress(user);

  useEffect(() => {
    if (!enabled || !ideaBalanceAddress) {
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const data = await dataProvider.getRoyaltyCoinBalance(
          ideaBalanceAddress,
          getRcSwapChainId()
        );
        if (cancelled) return;
        dispatch(setWalletData({ ideaCoins: data?.balance ?? 0 }));
      } catch {
        if (!cancelled) {
          dispatch(setWalletData({ ideaCoins: 0 }));
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [dispatch, enabled, ideaBalanceAddress]);

  // Live updates: the background worker emits `rc-update` on a per-wallet
  // channel after RC coins are credited — refetch the header balance then.
  useEffect(() => {
    if (!enabled || !ideaBalanceAddress) {
      return undefined;
    }

    const channelName = `rc-balance-${ideaBalanceAddress.toLowerCase()}`;
    let refetchTimer: number | undefined;

    const refetchRcBalance = () => {
      if (refetchTimer !== undefined) {
        window.clearTimeout(refetchTimer);
      }
      refetchTimer = window.setTimeout(async () => {
        try {
          const data = await dataProvider.getRoyaltyCoinBalance(
            ideaBalanceAddress,
            getRcSwapChainId()
          );
          dispatch(setWalletData({ ideaCoins: data?.balance ?? 0 }));
        } catch {
          dispatch(setWalletData({ ideaCoins: 0 }));
        }
      }, RC_REFETCH_DEBOUNCE_MS);
    };

    const rcChannel = pusher.subscribe(channelName);
    rcChannel.bind('rc-update', refetchRcBalance);

    return () => {
      if (refetchTimer !== undefined) {
        window.clearTimeout(refetchTimer);
      }
      rcChannel.unbind('rc-update', refetchRcBalance);
      pusher.unsubscribe(channelName);
    };
  }, [dispatch, enabled, ideaBalanceAddress]);
}
