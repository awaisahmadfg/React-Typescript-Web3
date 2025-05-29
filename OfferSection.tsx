import React, { useEffect, useMemo, useReducer } from 'react';
import { useDispatch } from 'react-redux';
import Config from 'config/config';
import { Token } from 'interface/common';
import { TxApprovalModal } from 'modals/TxApprovalModal';
import moment from 'moment';
import { MarketplaceTable } from 'pages/components/MarketplaceTable';
import Actions from 'redux-state/actions';
import {
  GetBidOffers,
  GetTxApprovalModalObj,
  GetUser
} from 'redux-state/selectors';
import { BUTTON_TYPES, Constants } from 'utilities/constants';
import { NftAcceptSuccessTxModal } from '../NftAcceptSuccessTxModal';
import { nftDetailActions } from '../nftDetailState/actions';
import { localReducer } from '../nftDetailState/reducer';
import {
  columns,
  fetchAuctionExpiry,
  getInitialState,
  handleCloseModal
} from '../utils';
import { estimateGasForAccept } from '../utils/estimateGasForAccept';
import {
  getOfferCells,
  getTxApprovalModalProps,
  Header
} from '../utils/getTxApprovalModal';

interface OffersSectionProps {
  nft: Token;
}

export const OffersSection: React.FC<OffersSectionProps> = ({ nft }) => {
  const user = GetUser();
  const dispatch = useDispatch();
  const bidOffers = GetBidOffers();
  const txApprovalModalObj = GetTxApprovalModalObj();
  const expiryTimestamp = new Date(nft?.createdAt);
  const expiryDate = moment(expiryTimestamp).format('MMMM D, YYYY [at] h:mm A');
  const initialNftDetailState = getInitialState();
  const [nftDetailState, localDispatch] = useReducer(
    localReducer,
    initialNftDetailState
  );

  useEffect(() => {
    dispatch(Actions.getBidOffers({ tokenId: nft?._id }));
  }, [dispatch, nft?._id]);

  useEffect(() => {
    if (nft?.tokenId) {
      fetchAuctionExpiry(nft?.tokenId, localDispatch);
    }
  }, [nft?.tokenId, localDispatch]);

  const handleAcceptOfferClick = async (bidOwner: string | number | null) => {
    localDispatch(nftDetailActions.setState({ bidOwner: bidOwner }));
    localDispatch(
      nftDetailActions.setState({ buttonType: BUTTON_TYPES.ACCEPT })
    );
    await estimateGasForAccept(
      user.privateKey,
      nft?.tokenId,
      dispatch,
      localDispatch
    );
  };

  const modalProps = useMemo(
    () =>
      getTxApprovalModalProps({
        localDispatch,
        nftDetailState,
        dispatch,
        nft,
        txApprovalModalObj,
        user,
        bidOffers: bidOffers
      }),
    [nftDetailState, dispatch, nft, txApprovalModalObj, user, bidOffers]
  );

  useEffect(() => {
    if (nftDetailState.networkResponse?.status === Constants.COMPLETE_STATUS) {
      localDispatch(nftDetailActions.setState({ openSuccessModal: true }));
    }
  }, [nftDetailState.networkResponse?.status]);

  const getCells = useMemo(
    () =>
      getOfferCells({
        userId: user?.id,
        nftOwner: nft?.owner,
        handleAcceptOfferClick,
        nftDetailState,
        expiryDate,
        auctionExpiry: nft.expiryDate
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, nft?.owner, nftDetailState]
  );

  const rows = useMemo(
    () => ({
      component: (item: Token, index: number) => getCells(item, index),
      items: bidOffers
    }),
    [bidOffers, getCells]
  );

  return (
    <>
      <MarketplaceTable
        header={<Header />}
        columns={columns}
        rows={rows}
        filter={false}
      />
      {modalProps.show && (
        <TxApprovalModal
          destAddress={Config.MARKETPLACE_CONTRACT_ADDRESS}
          from={user.walletAddress}
          gasFee={txApprovalModalObj.gasFee}
          onConfirm={modalProps.onConfirm}
          onReject={modalProps.onReject}
          open={txApprovalModalObj.open}
          transactionType={modalProps.transactionType}
          type={txApprovalModalObj.type}
        />
      )}
      {nftDetailState.openSuccessModal && (
        <NftAcceptSuccessTxModal
          nft={nft}
          onClose={() => handleCloseModal(localDispatch, nftDetailState)}
          nftDetailState={nftDetailState}
        />
      )}
    </>
  );
};
