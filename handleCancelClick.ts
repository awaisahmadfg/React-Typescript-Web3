import React from 'react';
import {
  estimateGasForCancelAuctionNft,
  estimateGasForCancelNft,
  getBalanceByType,
  getListingOwnerAddress,
  getAuctionOwnerAddress
} from 'helpers/blockchain';
import { toastify } from 'pages/newContests/toastify';
import Actions from 'redux-state/actions';
import { setCancelNftLoading } from 'redux-state/nftMarketplace/actions';
import { ASSET_TYPES, ERRORS, VARIANT } from 'utilities/constants';
import { checkBalanceAndToast, openTxApprovalModal } from './utils';
import { Profile } from '../CardProfile';
import dataProvider from 'dataPrvider';
import { Tag } from 'interface/common';

const DISPLAY_TIME = 2500;

const getWalletAddressForOwner = async (
  user: Profile,
  listingOwnerAddress: string
): Promise<string | undefined> => {
  const tag = await dataProvider.getList<Tag>('tags', {
    filter: { owner: user?.id },
    pagination: undefined,
    sort: undefined
  });

  if (tag?.data?.[0]?.walletAddress) {
    const tagWalletAddress = tag.data[0].walletAddress.toLowerCase();
    if (tagWalletAddress === listingOwnerAddress.toLowerCase()) {
      return tag.data[0].walletAddress;
    }
  }

  if (user?.walletAddress) {
    if (
      user.walletAddress.toLowerCase() === listingOwnerAddress.toLowerCase()
    ) {
      return user.walletAddress;
    }
  }

  return undefined;
};

const handleInsufficientBalance = (
  dispatch: any,
  nftTokenId: string,
  // eslint-disable-next-line no-unused-vars
  setLoadingFn: (tokenId: string, loading: boolean) => void
) => {
  setLoadingFn(nftTokenId, false);
  dispatch(
    Actions.openTransakBuyModal({
      openTransakBuyModalObj: {
        open: true
      }
    })
  );
};

export const handleCancelButtonClick = async (
  tokenId: string,
  privateKey: string | undefined,
  userId: string | number,
  dispatch: any,
  setShowCancelNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>,
  onAuction: boolean,
  user?: Profile
) => {
  dispatch(setCancelNftLoading(tokenId, true));

  try {
    // Get listing/auction owner address from contract
    const listingOwnerAddress = onAuction
      ? await getAuctionOwnerAddress(tokenId)
      : await getListingOwnerAddress(tokenId);

    // Get the owner's private key (could be user or company)
    const walletAddress = user
      ? await getWalletAddressForOwner(user, listingOwnerAddress)
      : undefined;

    if (!walletAddress) {
      dispatch(setCancelNftLoading(tokenId, false));
      toastify(
        'Wallet address not found. Please ensure your wallet is connected.',
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      return;
    }

    const hasSufficientBalance = await checkBalanceAndToast(walletAddress);
    if (!hasSufficientBalance) {
      handleInsufficientBalance(dispatch, tokenId, setCancelNftLoading);
      return;
    }

    const gasFee = onAuction
      ? await estimateGasForCancelAuctionNft(walletAddress, tokenId)
      : await estimateGasForCancelNft(walletAddress, tokenId);

    const userBalance = await getBalanceByType(
      ASSET_TYPES.ETHEREUM,
      walletAddress
    );
    if (userBalance < gasFee) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      handleInsufficientBalance(dispatch, tokenId, setCancelNftLoading);
      return;
    }
    // Show the actual wallet address that will sign the transaction
    openTxApprovalModal(gasFee, ASSET_TYPES.NFT, dispatch, walletAddress);
    setShowCancelNftApprovalModal(true);
  } catch (error) {
    console.error(ERRORS.CANCEL_ERROR, error);
    setShowCancelNftApprovalModal(false);
    throw error;
  } finally {
    dispatch(setCancelNftLoading(tokenId, false));
  }
};
