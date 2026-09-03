/* eslint-disable */
import React from 'react';
import { Token } from 'interface/common';
import { BUTTON_TYPES, ERRORS } from 'utilities/constants';
import { handleCancelButtonClick } from './handleCancelClick';
import {
  handleBidButtonClick,
  handleBuyButtonClick,
  handleListButtonClick
} from './utils';
import { Profile } from '../CardProfile';

export const handleNftCardButtonClick = async (
  buttonType: string,
  selectedWallet: string | null,
  user: Profile,
  dispatch: any,
  setShowBuyNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>,
  setShowCancelNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>,
  setOpenBidModal: React.Dispatch<React.SetStateAction<boolean>>,
  token: Token
) => {
  const nftTokenId = token.tokenId;
  const onAuction = token.onAuction;
  switch (buttonType) {
    case BUTTON_TYPES.BUY:
      await handleBuyButtonClick(
        nftTokenId,
        dispatch,
        setShowBuyNftApprovalModal,
        selectedWallet,
        user?.id,
        user
      );
      break;

    case BUTTON_TYPES.BID:
      await handleBidButtonClick(setOpenBidModal, dispatch);
      break;
    case BUTTON_TYPES.CANCEL:
      await handleCancelButtonClick(
        token,
        // reuse the same dispatch type; detailed typing handled in handleCancelClick
        dispatch,
        setShowCancelNftApprovalModal,
        onAuction,
        user
      );
      break;

    case BUTTON_TYPES.LIST:
      await handleListButtonClick(token._id, '', dispatch, nftTokenId);
      break;

    default:
      console.error(ERRORS.UNHANDLED_TYPE, buttonType);
      break;
  }
};

export const onNftCardButtonClick = async (
  buttonType: string,
  selectedWallet: string | null,
  user: Profile,
  dispatch: any,
  setShowBuyNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>,
  setShowCancelNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>,
  setOpenBidModal: React.Dispatch<React.SetStateAction<boolean>>,
  token: Token,
  router: any,
  // eslint-disable-next-line no-unused-vars
  redirectToAuthPage: (returnUrl: string) => void
) => {
  if (!user) {
    redirectToAuthPage(router.location.pathname);
    return;
  }
  await handleNftCardButtonClick(
    buttonType,
    selectedWallet,
    user,
    dispatch,
    setShowBuyNftApprovalModal,
    setShowCancelNftApprovalModal,
    setOpenBidModal,
    token
  );
};
