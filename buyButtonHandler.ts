import React from 'react';
import Config from 'config/config';
import MarketplaceAbi from 'contract/IdeaMarketplace.json';
import dataProvider from 'dataPrvider';
import { ethers } from 'ethers';
import {
  calculateGasFee,
  getBalanceByType,
  provider
} from 'helpers/blockchain';
import { Tag } from 'interface/common';
import { toastify } from 'pages/newContests/toastify';
import Actions from 'redux-state/actions';
import { setBuyNftLoading } from 'redux-state/nftMarketplace/actions';
import { ASSET_TYPES, Constants, ERRORS, VARIANT } from 'utilities/constants';
import { checkBalanceAndToast } from './balanceUtils';
import { openTxApprovalModal } from './modalUtils';
import { Profile } from 'components/CardProfile';

const DISPLAY_TIME = 2500;

interface ReduxDispatch {
  // eslint-disable-next-line no-unused-vars
  (action: { type: string; payload?: unknown }): void;
}

export const handleBuyButtonClick = async (
  tokenId: string,
  dispatch: ReduxDispatch,
  setShowBuyNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>,
  walletAddress: string,
  userId: string | number,
  user?: Profile | null
) => {
  dispatch(setBuyNftLoading(tokenId, true));

  // Get wallet address from tag or user (no private key needed)
  let addressToUse = walletAddress;

  if (!addressToUse && user) {
    const tag = await dataProvider.getList<Tag>('tags', {
      filter: { owner: user?.id },
      pagination: undefined,
      sort: undefined
    });

    if (tag?.data?.[0]) {
      addressToUse = tag?.data?.[0]?.walletAddress;
    } else {
      addressToUse = user?.walletAddress;
    }
  }

  if (!addressToUse) {
    console.error('[handleBuyButtonClick] No wallet address available');
    dispatch(setBuyNftLoading(tokenId, false));
    toastify(
      'Wallet address not found. Please ensure your wallet is connected.',
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
      DISPLAY_TIME
    );
    return;
  }

  // Check balance using wallet address (no private key needed)
  const hasSufficientBalance = await checkBalanceAndToast(addressToUse);

  if (!hasSufficientBalance) {
    dispatch(setBuyNftLoading(tokenId, false));
    dispatch(
      Actions.openTransakBuyModal({
        openTransakBuyModalObj: {
          open: true
        }
      })
    );
    return;
  }

  try {
    // Use provider directly for read-only operations (no private key needed)
    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const fixedPriceData = await ideaMarketplaceContract.fixedPrice(tokenId);

    const userBalance = await getBalanceByType(
      ASSET_TYPES.ETHEREUM,
      addressToUse
    );
    const userBalanceInWei = ethers.utils.parseUnits(
      String(userBalance),
      Constants.ETHER
    );

    if (userBalanceInWei.lt(fixedPriceData.nftPrice)) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      dispatch(setBuyNftLoading(tokenId, false));
      return;
    }

    if (addressToUse.toLowerCase() === fixedPriceData.owner.toLowerCase()) {
      toastify(
        ERRORS.CANNOT_BUY,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(setBuyNftLoading(tokenId, false));
      return;
    }

    // Estimate gas using provider (read-only, no private key needed)
    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.buyFixedPriceNft(tokenId, {
        value: fixedPriceData.nftPrice,
        from: addressToUse
      });
    const gasFee = await calculateGasFee(gasEstimate);

    const purchaseAmount = ethers.utils
      .formatUnits(fixedPriceData.nftPrice, Constants.ETHER)
      .toString();

    openTxApprovalModal(
      gasFee,
      ASSET_TYPES.NFT,
      dispatch,
      addressToUse,
      purchaseAmount
    );
    setShowBuyNftApprovalModal(true);
  } catch (error) {
    console.error(ERRORS.BUY_GAS_ESTIMATE, error, error.message);
    dispatch(setBuyNftLoading(tokenId, false));
  }
};
