import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import {
  convertEthToUsd,
  fetchIdeaCoinPriceUsd,
  getBalanceByType
} from 'helpers/blockchain';
import { useDispatch } from 'react-redux';
import Actions from 'redux-state/actions';
import { colorPalette } from 'theme';
import { ASSET_TYPES, Constants, ERRORS } from 'utilities/constants';
import { StyledSkeleton } from './styledComponents';
import { Body, Heading3 } from '../common/StyledComponents';

interface BalanceProps {
  address: string;
  refresh?: number;
  setWalletBalance?: Dispatch<SetStateAction<number>>;
  type: string;
  /** Preloaded IdeaCoin price when wallet opens (null = still loading). Avoids brief 0 USD. */
  preloadedIdeaCoinPriceUsd?: number | null;
}

const EquivalentCurrencies = {
  [ASSET_TYPES.ETHEREUM]: Constants.USD,
  [ASSET_TYPES.IDEACOINS]: Constants.USD
};

const conversionFunctions = {
  [ASSET_TYPES.ETHEREUM]: (balance) => convertEthToUsd(balance),
  [ASSET_TYPES.IDEACOINS]: () => 0
};

export const Balance: React.FC<BalanceProps> = ({
  type,
  address,
  refresh,
  setWalletBalance,
  preloadedIdeaCoinPriceUsd
}) => {
  const dispatch = useDispatch();

  const [balance, setBalance] = useState<number>();
  const [equivalentBalance, setEquivalentBalance] = useState<number>();
  const [ideaCoinUsd, setIdeaCoinUsd] = useState<number>(0);
  const [ideaCoinPriceLoading, setIdeaCoinPriceLoading] = useState<boolean>(
    type === ASSET_TYPES.IDEACOINS
  );
  const [loading, setLoading] = useState<boolean>(true);

  const usePreloadedPrice =
    type === ASSET_TYPES.IDEACOINS && preloadedIdeaCoinPriceUsd !== undefined;
  const effectiveIdeaCoinUsd = usePreloadedPrice
    ? (preloadedIdeaCoinPriceUsd ?? 0)
    : ideaCoinUsd;
  const isIdeaCoinPriceLoading =
    type === ASSET_TYPES.IDEACOINS &&
    (usePreloadedPrice
      ? preloadedIdeaCoinPriceUsd === null
      : ideaCoinPriceLoading);

  useEffect(() => {
    dispatch(Actions.getRewardPoolThreshold());
  }, [dispatch]);

  useEffect(() => {
    if (type === ASSET_TYPES.IDEACOINS && !usePreloadedPrice) {
      setIdeaCoinPriceLoading(true);
      fetchIdeaCoinPriceUsd()
        .then((v) => {
          setIdeaCoinUsd(v);
          setIdeaCoinPriceLoading(false);
        })
        .catch(() => {
          setIdeaCoinUsd(0);
          setIdeaCoinPriceLoading(false);
        });
    }
  }, [type, usePreloadedPrice]);

  useEffect(() => {
    setLoading(true);
    getBalanceByType(type, address)
      .then(async (balance) => {
        if (balance !== undefined) {
          const numBalance = Number(balance);
          setBalance(numBalance);
          setWalletBalance(numBalance);
          if (type === ASSET_TYPES.IDEACOINS) {
            setEquivalentBalance(
              parseFloat((numBalance * effectiveIdeaCoinUsd).toFixed(2))
            );
          } else {
            const equivalentAmount =
              await conversionFunctions[type](numBalance);
            setEquivalentBalance(
              parseFloat(Number(equivalentAmount).toFixed(2))
            );
          }
        }
      })
      .catch((error) => {
        console.error(`${ERRORS.FETCH_BALANCE} ${type}:`, error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [type, address, refresh, setWalletBalance, effectiveIdeaCoinUsd]);

  useEffect(() => {
    if (type === ASSET_TYPES.IDEACOINS && balance !== undefined) {
      setEquivalentBalance(
        parseFloat((balance * effectiveIdeaCoinUsd).toFixed(2))
      );
    }
  }, [type, balance, effectiveIdeaCoinUsd]);

  return (
    <>
      {loading ? (
        <>
          <StyledSkeleton width="13.125rem" height="2.1875rem" />
          <StyledSkeleton width="9.0625rem" height="1.5rem" />
        </>
      ) : (
        <>
          <Heading3
            fontWeight={700}
            lineHeight="3rem"
            color={colorPalette.purpleHeart2}
          >
            {(Math.floor(balance * 10000) / 10000).toFixed(4)}
            <span
              style={{
                paddingLeft: '0.5rem'
              }}
            >
              {type === ASSET_TYPES.ETHEREUM ? ASSET_TYPES.ETH : type}
            </span>
          </Heading3>
          {type === ASSET_TYPES.IDEACOINS && isIdeaCoinPriceLoading ? (
            <StyledSkeleton
              width="9.0625rem"
              height="1.5rem"
              sx={{ marginTop: '-0.625rem', marginLeft: '0.1875rem' }}
            />
          ) : (
            <Body
              fontWeight={600}
              lineHeight="1.5rem"
              sx={{ marginTop: '-0.625rem', marginLeft: '0.1875rem' }}
            >{`${equivalentBalance ?? 0} ${EquivalentCurrencies[type]}`}</Body>
          )}
        </>
      )}
    </>
  );
};
