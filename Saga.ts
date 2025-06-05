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
import { fetchGetListedNftsPayload } from 'components/ListedNftsView/hooks/useFetchListedNfts';
import * as ProfileActions from '../profile/actions';
import * as CommonActions from '../commons/actions';
import { fetchGetUserNftsPayload } from 'components/UserNftsView/hooks/useFetchNftData';
import { Constants } from 'utilities/constants';

function* buyNftSaga(action: any) {
  try {
    const { fixedId, priceOfNft, filters, pagination, user } = action.payload;
    yield put(Actions.setBuyNftLoading(fixedId, true));
    const response = yield call(Api.buyFixedNft, fixedId, priceOfNft);
    if (response) {
      yield put(Actions.setBuyNftLoading(fixedId, false));
      yield put(Actions.buyNftSuccess(response));
      const payload = yield call(
        fetchGetListedNftsPayload,
        filters,
        pagination,
        user
      );

      yield put(ProfileActions.getUserNfts(payload));
      yield put(CommonActions.getListedNfts(payload));
    }
  } catch (error) {
    yield put(Actions.buyNftFailure(error.message));
  }
}

function* cancelFixedNftSaga(action: any) {
  try {
    const { fixedId, priceOfNft, filters, pagination, user } = action.payload;
    yield put(Actions.setCancelNftLoading(fixedId, true));
    const response = yield call(Api.cancelFixedNft, fixedId, priceOfNft);
    if (response) {
      yield put(Actions.setCancelNftLoading(fixedId, false));
      yield put(Actions.cancelFixedNftSuccess(response));
      const getUserNftsPayload = yield call(
        fetchGetUserNftsPayload,
        filters,
        pagination,
        user
      );
      yield put(ProfileActions.getUserNfts(getUserNftsPayload));
    }
  } catch (error) {
    yield put(Actions.cancelFixedNftFailure(error.message));
  }
}

function* listFixedNftSaga(action: any) {
  try {
    const { fixedId, listPrice, usdPrice, filters, pagination, user } =
      action.payload;
    yield put(Actions.setListNftLoading(true));
    const response = yield call(Api.listFixedNft, fixedId, listPrice, usdPrice);
    if (response) {
      if (response.transactionHash) {
        yield put(Actions.setTransactionHash(response.transactionHash));
      }
      yield put(Actions.listFixedNftSuccess(response));
      yield put(Actions.setListNftLoading(false));
      yield put(Actions.openListSuccessModal());

      const getUserNftsPayload = yield call(
        fetchGetUserNftsPayload,
        filters,
        pagination,
        user
      );
      yield put(ProfileActions.getUserNfts(getUserNftsPayload));
    }
  } catch (error) {
    yield put(Actions.listFixedNftFailure(error.message));
  }
}

function* listAuctionNftSaga(action: any) {
  try {
    const {
      listPrice,
      auctionStartTime,
      auctionEndTime,
      tokenId,
      usdPrice,
      filters,
      pagination,
      user
    } = action.payload;
    yield put(Actions.setListNftLoading(true));
    const response = yield call(
      Api.listAuctionNft,
      listPrice,
      auctionStartTime,
      auctionEndTime,
      tokenId,
      usdPrice
    );
    if (response) {
      if (response.transactionHash) {
        yield put(Actions.setTransactionHash(response.transactionHash));
      }
      yield put(Actions.listAuctionNftSuccess(response));
      yield put(Actions.setListNftLoading(false));
      yield put(Actions.openListSuccessModal());

      const getUserNftsPayload = yield call(
        fetchGetUserNftsPayload,
        filters,
        pagination,
        user
      );
      yield put(ProfileActions.getUserNfts(getUserNftsPayload));
    }
  } catch (error) {
    yield put(Actions.listAuctionNftFailure(error.message));
  }
}

function* cancelAuctionNftSaga(action: any) {
  try {
    const { auctionId, priceOfNft, filters, pagination, user, nftId } =
      action.payload;
    yield put(Actions.setCancelNftLoading(auctionId, true));
    const response = yield call(Api.cancelAuctionNft, auctionId, priceOfNft);
    if (response) {
      yield put(Actions.cancelAuctionNftSuccess(response));
      yield put(ProfileActions.getBidOffers({ tokenId: nftId }));
      const getUserNftsPayload = yield call(
        fetchGetUserNftsPayload,
        filters,
        pagination,
        user
      );
      yield put(ProfileActions.getUserNfts(getUserNftsPayload));
    }
  } catch (error) {
    yield put(Actions.cancelFixedNftFailure(error.message));
  }
}

function* bidNftSaga(action: any) {
  try {
    const { auctionId, bidAmount, usdPrice, nftId } = action.payload;
    yield put(Actions.setBidNftLoading(true));
    const response = yield call(
      Api.bidAuctionNft,
      auctionId,
      bidAmount,
      usdPrice
    );
    if (response) {
      if (response.transactionHash) {
        yield put(Actions.setTransactionHash(response.transactionHash));
      }
      yield put(Actions.bidNftSuccess(response));
      yield put(ProfileActions.getBidOffers({ tokenId: nftId }));
      yield put(Actions.setBidNftLoading(false));
      yield put(Actions.openBidSuccessModal());
    }
  } catch (error) {
    yield put(Actions.bidNftFailure(error.message));
  }
}

function* acceptOfferSaga(action: any) {
  try {
    const { auctionId, bidOffers, nftId, context } = action.payload;
    if (context === Constants.TABLE) {
      yield put(Actions.setAcceptTableLoading(true));
    } else {
      yield put(Actions.setAcceptNftLoading(true));
    }
    const response = yield call(
      Api.acceptOffer,
      auctionId,
      bidOffers[0]?.userId?.id
    );
    if (response) {
      yield put(Actions.acceptOfferSuccess(response));
      yield put(ProfileActions.getBidOffers({ tokenId: nftId }));
      if (context === Constants.TABLE) {
        yield put(Actions.setAcceptTableLoading(false));
      } else {
        yield put(Actions.setAcceptNftLoading(false));
      }
      yield put(Actions.openAcceptBidSuccessModal());
    }
  } catch (error) {
    yield put(Actions.acceptOfferFailure(error.message));
  }
}

function* claimNftSaga(action: any) {
  try {
    const { tokenId, nftId } = action.payload;
    yield put(Actions.setClaimLoading(true));
    const response = yield call(Api.claimNft, tokenId);
    if (response) {
      yield put(Actions.setClaimLoading(false));
      yield put(Actions.claimNftSuccess(response));
      yield put(ProfileActions.getBidOffers({ tokenId: nftId }));
      yield put(Actions.openClaimSuccessModal());
    }
  } catch (error) {
    yield put(Actions.claimNftFailure(error.message));
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
