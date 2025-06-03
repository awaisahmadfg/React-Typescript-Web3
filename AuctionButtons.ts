import React, { Dispatch, SetStateAction } from 'react';
import Actions from 'redux-state/actions';
import { Token } from 'interface/common';
import { ButtonBox, FullWidthActionButton } from '../../styledComponents';
import { colorPalette } from 'theme';
import { Constants } from 'utilities/constants';
import {
  NftDetailAction,
  NftDetailState
} from '../../nftDetailState/interfaces';
import { handleClaimNftClick } from '../../utils/handleClaimToken';
import { StyledCircularProgress } from 'components/NftCardButton/StyledComponents';
import { Profile } from 'components/CardProfile';
import { handleAcceptOfferClick } from '../../utils/handleAcceptOffer';

export const renderPlaceBidButton = (
  nft: Token,
  setOpenBidModal: React.Dispatch<SetStateAction<boolean>>,
  showPlaceBidButton: boolean,
  dispatch: any
) => {
  if (!showPlaceBidButton) return null;
  return (
    <ButtonBox>
      <FullWidthActionButton
        fontColor={colorPalette.white}
        bgColor={colorPalette.purple}
        disabled={
          new Date(nft?.auctionStartTime).getTime() >= new Date().getTime()
        }
        onClick={() => {
          setOpenBidModal(true);
          dispatch(Actions.clearTransactionHash());
        }}
      >
        {Constants.PLACE_A_BID}
      </FullWidthActionButton>
    </ButtonBox>
  );
};

export const renderClaimNftButton = (
  localDispatch: Dispatch<NftDetailAction>,
  nftDetailState: NftDetailState,
  privateKey: string,
  tokenId: string,
  showClaimNftButton: boolean,
  dispatch: any,
  claimLoading: boolean
) => {
  if (!showClaimNftButton) return null;
  return (
    <ButtonBox>
      <FullWidthActionButton
        fontColor={colorPalette.white}
        bgColor={colorPalette.purple}
        loading={claimLoading}
        onClick={() =>
          handleClaimNftClick(localDispatch, privateKey, tokenId, dispatch)
        }
      >
        {claimLoading ? (
          <StyledCircularProgress size={20} />
        ) : (
          Constants.CLAIM_NFT
        )}
      </FullWidthActionButton>
    </ButtonBox>
  );
};

export const renderAcceptOfferButton = (
  localDispatch: Dispatch<NftDetailAction>,
  nftDetailState: NftDetailState,
  privateKey: string,
  tokenId: string,
  showAcceptOfferButton: boolean,
  bidOffers: Profile,
  dispatch: any,
  acceptLoading: boolean
) => {
  if (!showAcceptOfferButton) return null;
  return (
    <ButtonBox>
      <FullWidthActionButton
        fontColor={colorPalette.white}
        bgColor={colorPalette.purple}
        loading={acceptLoading}
        onClick={() =>
          handleAcceptOfferClick(
            bidOffers?.userId?.id,
            localDispatch,
            privateKey,
            tokenId,
            dispatch,
            'priceDetails'
          )
        }
      >
        {acceptLoading ? (
          <StyledCircularProgress size={20} />
        ) : (
          Constants.ACCEPT_OFFER
        )}
      </FullWidthActionButton>
    </ButtonBox>
  );
};
