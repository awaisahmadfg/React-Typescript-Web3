/* eslint-disable */
import { call, put, takeLatest } from 'redux-saga/effects';
import {
  ACCEPT_OFFER,
  BID_NFT,
  BUY_NFT,
  CANCEL_AUCTION_NFT,
  CANCEL_FIXED_NFT,
  CLAIM_NFT,
  LIST_AUCTION_NFT,
  LIST_FIXED_NFT
} from './types';
import * as Api from './api';
import * as Actions from './actions';
import * as CommonActions from '../commons/actions';
import {
  BuyNftAction,
  CancelFixedNftAction,
  ListFixedNftAction,
  ListAuctionNftAction,
  CancelAuctionNftAction,
  BidNftAction,
  AcceptOfferAction,
  ClaimNftAction
} from './sagaTypes';
import {
  setAcceptLoading,
  refreshUserNfts,
  extractAuctionErrorMessage,
  extractBidErrorMessage,
  handleErrorWithToast,
  handleListNftSuccess,
  handleBidNftSuccess,
  handleFixedListNftSuccess,
  handleAcceptOfferSuccess,
  handleClaimNftSuccess,
  refreshCompanyNfts
} from './sagaHelpers';
import {
  handleBuyNftSuccess,
  handleCancelFixedNftSuccess,
  handleCancelAuctionNftSuccess
} from './sagaSuccessHandlers';
import {
  handleClaimNftError,
  handleAcceptOfferError
} from './sagaErrorHandlers';

function* buyNftSaga(action: BuyNftAction) {
  const {
    fixedId,
    priceOfNft,
    filters,
    pagination,
    user,
    walletAddress,
    context
  } = action.payload;
  try {
    yield put(Actions.setBuyNftLoading(fixedId, true));
    const response = yield call(
      Api.buyFixedNft,
      fixedId,
      priceOfNft,
      walletAddress
    );
    if (response) {
      yield* handleBuyNftSuccess(
        response,
        fixedId,
        filters,
        pagination,
        user,
        context
      );
    } else {
      yield put(Actions.setBuyNftLoading(fixedId, false));
      yield put(Actions.setConfirmButtonLoading(false));
      yield put(Actions.buyNftFailure('No response received from server'));
    }
  } catch (error) {
    yield put(Actions.setBuyNftLoading(fixedId, false));
    yield put(Actions.setConfirmButtonLoading(false));
    yield put(
      Actions.buyNftFailure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

function* cancelFixedNftSaga(action: CancelFixedNftAction) {
  try {
    const { fixedId, priceOfNft, filters, pagination, user } = action.payload;
    yield put(Actions.setCancelNftLoading(fixedId, true));
    const response = yield call(Api.cancelFixedNft, fixedId, priceOfNft);
    if (response) {
      yield* handleCancelFixedNftSuccess(
        response,
        fixedId,
        filters,
        pagination,
        user
      );
    }
  } catch (error) {
    yield put(Actions.setConfirmButtonLoading(false));
    yield put(
      Actions.cancelFixedNftFailure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

function* listFixedNftSaga(action: ListFixedNftAction) {
  const {
    fixedId,
    listPrice,
    usdPrice,
    filters,
    pagination,
    user,
    walletAddress
  } = action.payload;
  try {
    yield put(Actions.setListNftLoading(fixedId, true));
    const response = yield call(
      Api.listFixedNft,
      fixedId,
      listPrice,
      usdPrice,
      walletAddress
    );
    if (response) {
      yield* handleFixedListNftSuccess(response, fixedId);
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'my-collections' || tab === 'marketplace') {
        yield call(refreshUserNfts, filters, pagination, user);
      } else {
        yield call(refreshCompanyNfts, filters, pagination, user);
      }
    }
  } catch (error) {
    const errorMessage = extractAuctionErrorMessage(error);
    yield* handleErrorWithToast(error, errorMessage);
    yield put(Actions.setListNftLoading(fixedId, false));
    yield put(Actions.setConfirmButtonLoading(false));
    yield put(CommonActions.setModalClosable(true));
    yield put(
      Actions.listFixedNftFailure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

function* listAuctionNftSaga(action: ListAuctionNftAction) {
  const {
    listPrice,
    auctionStartTime,
    auctionEndTime,
    tokenId,
    usdPrice,
    filters,
    pagination,
    user,
    walletAddress
  } = action.payload;
  try {
    yield put(Actions.setListNftLoading(tokenId, true));
    const response = yield call(
      Api.listAuctionNft,
      listPrice,
      auctionStartTime,
      auctionEndTime,
      tokenId,
      usdPrice,
      walletAddress
    );
    if (response) {
      yield* handleListNftSuccess(response, tokenId);
      yield put(Actions.listAuctionNftSuccess(response));
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'my-collections' || tab === 'marketplace') {
        yield call(refreshUserNfts, filters, pagination, user);
      } else {
        yield call(refreshCompanyNfts, filters, pagination, user);
      }
    }
  } catch (error) {
    const errorMessage = extractAuctionErrorMessage(error);
    yield* handleErrorWithToast(error, errorMessage);

    yield put(Actions.setListNftLoading(tokenId, false));
    yield put(Actions.setConfirmButtonLoading(false));
    yield put(CommonActions.setModalClosable(true));

    yield put(
      Actions.listAuctionNftFailure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

function* cancelAuctionNftSaga(action: CancelAuctionNftAction) {
  try {
    const { auctionId, priceOfNft, filters, pagination, user, nftId } =
      action.payload;
    yield put(Actions.setCancelNftLoading(auctionId, true));
    const response = yield call(Api.cancelAuctionNft, auctionId, priceOfNft);
    if (response) {
      yield* handleCancelAuctionNftSuccess(
        response,
        auctionId,
        nftId,
        filters,
        pagination,
        user
      );
    }
  } catch (error) {
    yield put(Actions.setConfirmButtonLoading(false));
    yield put(
      Actions.cancelAuctionNftFailure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

function* bidNftSaga(action: BidNftAction) {
  try {
    const { auctionId, bidAmount, usdPrice, nftId, walletAddress } =
      action.payload;
    yield put(Actions.setBidNftLoading(true));
    const response = yield call(
      Api.bidAuctionNft,
      auctionId,
      bidAmount,
      usdPrice,
      walletAddress
    );
    if (response) {
      yield* handleBidNftSuccess(response, nftId);
    } else {
      yield put(Actions.setBidNftLoading(false));
      yield put(Actions.setConfirmButtonLoading(false));
      yield put(Actions.bidNftFailure('No response received from server'));
    }
  } catch (error) {
    const errorMessage = extractBidErrorMessage(error);
    yield* handleErrorWithToast(error, errorMessage);

    yield put(Actions.setBidNftLoading(false));
    yield put(Actions.setConfirmButtonLoading(false));
    yield put(CommonActions.setModalClosable(true));

    yield put(
      Actions.bidNftFailure(
        error instanceof Error ? error.message : String(error)
      )
    );
  }
}

function* acceptOfferSaga(action: AcceptOfferAction) {
  const { auctionId, bidOffers, nftId, context, walletAddress } =
    action.payload;
  try {
    yield call(setAcceptLoading, context, true);
    const bidOwnerId = bidOffers && bidOffers[0] ? bidOffers[0].id : null;
    if (!bidOwnerId) {
      throw new Error('Bid owner ID is required');
    }
    const response = yield call(
      Api.acceptOffer,
      auctionId,
      String(bidOwnerId),
      walletAddress
    );
    if (response) {
      yield* handleAcceptOfferSuccess(response, nftId, context);
    } else {
      yield call(setAcceptLoading, context, false);
      yield put(Actions.setConfirmButtonLoading(false));
      yield put(CommonActions.setModalClosable(true));
      yield put(Actions.acceptOfferFailure('No response received from server'));
    }
  } catch (error) {
    yield* handleAcceptOfferError(error, context);
  }
}

function* claimNftSaga(action: ClaimNftAction) {
  try {
    const { tokenId, nftId, walletAddress } = action.payload;
    yield put(Actions.setClaimLoading(true));
    const response = yield call(Api.claimNft, tokenId, walletAddress);
    if (response) {
      yield* handleClaimNftSuccess(response, nftId);
    } else {
      yield put(Actions.setClaimLoading(false));
      yield put(Actions.setConfirmButtonLoading(false));
      yield put(CommonActions.setModalClosable(true));
      yield put(Actions.claimNftFailure('No response received from server'));
    }
  } catch (error) {
    yield* handleClaimNftError(error);
  }
}

function* mySaga() {
  yield takeLatest(LIST_FIXED_NFT, listFixedNftSaga);
  yield takeLatest(CANCEL_FIXED_NFT, cancelFixedNftSaga);
  yield takeLatest(BUY_NFT, buyNftSaga);
  yield takeLatest(LIST_AUCTION_NFT, listAuctionNftSaga);
  yield takeLatest(CANCEL_AUCTION_NFT, cancelAuctionNftSaga);
  yield takeLatest(BID_NFT, bidNftSaga);
  yield takeLatest(ACCEPT_OFFER, acceptOfferSaga);
  yield takeLatest(CLAIM_NFT, claimNftSaga);
}

export default mySaga;

