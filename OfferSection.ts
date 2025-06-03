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
  GetUser,
  useAcceptBidSuccess,
  useAcceptLoading,
  useAcceptTableLoading
} from 'redux-state/selectors';
import { NftAcceptSuccessTxModal } from '../NftAcceptSuccessTxModal';
import { nftDetailActions } from '../nftDetailState/actions';
import { localReducer } from '../nftDetailState/reducer';
import {
  columns,
  fetchAuctionExpiry,
  getInitialState,
  handleCloseAcceptBidModal
} from '../utils';
import { getTxApprovalModalProps, Header } from '../utils/getTxApprovalModal';
import { useAcceptOffer } from './utilits/useAcceptOffer';
import { useOfferRows } from './utilits/useOfferRows';

interface OffersSectionProps {
  nft: Token;
}

export const OffersSection: React.FC<OffersSectionProps> = ({ nft }) => {
  const user = GetUser();
  const dispatch = useDispatch();
  const bidOffers = GetBidOffers();
  const acceptBidSuccess = useAcceptBidSuccess();
  const acceptLoading = useAcceptLoading();
  const acceptTableLoading = useAcceptTableLoading();
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

  useEffect(() => {
    if (acceptBidSuccess) {
      localDispatch(nftDetailActions.setState({ openSuccessModal: true }));
    }
  }, [acceptBidSuccess]);

  const handleAcceptOfferClick = useAcceptOffer(
    user,
    nft,
    dispatch,
    localDispatch,
    'table'
  );

  const modalProps = useMemo(
    () =>
      getTxApprovalModalProps({
        localDispatch,
        nftDetailState,
        dispatch,
        nft,
        txApprovalModalObj,
        user,
        bidOffers: bidOffers,
        context: 'table'
      }),
    [nftDetailState, dispatch, nft, txApprovalModalObj, user, bidOffers]
  );

  const { rows } = useOfferRows({
    userId: user?.id,
    nftOwner: nft?.owner,
    handleAcceptOfferClick,
    expiryDate,
    auctionExpiry: nft?.expiryDate,
    acceptLoading: acceptTableLoading,
    bidOffers
  });

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
          onClose={() =>
            handleCloseAcceptBidModal(localDispatch, acceptLoading, dispatch)
          }
          nftDetailState={nftDetailState}
        />
      )}
    </>
  );
};
