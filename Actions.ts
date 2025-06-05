import { BigNumber } from 'ethers';
import {
  BUY_NFT,
  BUY_NFT_SUCCESS,
  BUY_NFT_FAILURE,
  CANCEL_FIXED_NFT,
  CANCEL_FIXED_NFT_SUCCESS,
  CANCEL_FIXED_NFT_FAILURE,
  SET_BUY_NFT_LOADING,
  SET_LIST_NFT_LOADING,
  SET_CANCEL_LOADING,
  SET_BID_LOADING,
  SET_CLAIM_LOADING,
  SET_ACCEPT_LOADING,
  LIST_FIXED_NFT,
  LIST_FIXED_NFT_SUCCESS,
  LIST_FIXED_NFT_FAILURE,
  OPEN_FIXED_LIST_SUCCESS_MODAL,
  CLOSE_FIXED_LIST_SUCCESS_MODAL,
  LIST_AUCTION_NFT,
  LIST_AUCTION_NFT_SUCCESS,
  LIST_AUCTION_NFT_FAILURE,
  CANCEL_AUCTION_NFT,
  CANCEL_AUCTION_NFT_SUCCESS,
  CANCEL_AUCTION_NFT_FAILURE,
  SET_TRANSACTION_HASH,
  BID_NFT,
  BID_NFT_SUCCESS,
  BID_NFT_FAILURE,
  OPEN_BID_SUCCESS_MODAL,
  CLOSE_BID_SUCCESS_MODAL,
  CLEAR_TRANSACTION_HASH,
  ACCEPT_OFFER,
  ACCEPT_OFFER_SUCCESS,
  ACCEPT_OFFER_FAILURE,
  OPEN_ACCEPT_BID_SUCCESS_MODAL,
  CLOSE_ACCEPT_BID_SUCCESS_MODAL,
  SET_ACCEPT_TABLE_LOADING,
  CLAIM_NFT,
  CLAIM_NFT_SUCCESS,
  CLAIM_NFT_FAILURE,
  OPEN_CLAIM_SUCCESS_MODAL,
  CLOSE_CLAIM_SUCCESS_MODAL
} from './types';
import { Constants } from 'utilities/constants';

export const buyNft = (
  fixedId: string,
  priceOfNft: object,
  filters,
  pagination,
  user
) => ({
  type: BUY_NFT,
  payload: { fixedId, priceOfNft, filters, pagination, user }
});

export const buyNftSuccess = (data: any) => ({
  type: BUY_NFT_SUCCESS,
  payload: data
});

export const buyNftFailure = (error: string) => ({
  type: BUY_NFT_FAILURE,
  payload: error
});

export const cancelFixedNft = (
  fixedId: string,
  priceOfNft: object,
  filters,
  pagination,
  user
) => ({
  type: CANCEL_FIXED_NFT,
  payload: { fixedId, priceOfNft, filters, pagination, user }
});

export const cancelFixedNftSuccess = (data: any) => ({
  type: CANCEL_FIXED_NFT_SUCCESS,
  payload: data
});

export const cancelFixedNftFailure = (error: string) => ({
  type: CANCEL_FIXED_NFT_FAILURE,
  payload: error
});

export const listFixedNft = (
  fixedId: string,
  listPrice: BigNumber,
  usdPrice: number,
  filters,
  pagination,
  user
) => ({
  type: LIST_FIXED_NFT,
  payload: { fixedId, listPrice, usdPrice, filters, pagination, user }
});

export const listFixedNftSuccess = (data: any) => ({
  type: LIST_FIXED_NFT_SUCCESS,
  payload: data
});

export const listFixedNftFailure = (error: string) => ({
  type: LIST_FIXED_NFT_FAILURE,
  payload: error
});

export const setTransactionHash = (transactionHash: string) => ({
  type: SET_TRANSACTION_HASH,
  payload: transactionHash
});

export const clearTransactionHash = () => ({
  type: CLEAR_TRANSACTION_HASH
});

export const listAuctionNft = (
  listPrice: BigNumber,
  auctionStartTime: BigNumber,
  auctionEndTime: BigNumber,
  tokenId: string,
  usdPrice: number,
  filters,
  pagination,
  user
) => ({
  type: LIST_AUCTION_NFT,
  payload: {
    listPrice,
    auctionStartTime,
    auctionEndTime,
    tokenId,
    usdPrice,
    filters,
    pagination,
    user
  }
});

export const listAuctionNftSuccess = (data: any) => ({
  type: LIST_AUCTION_NFT_SUCCESS,
  payload: data
});

export const listAuctionNftFailure = (error: string) => ({
  type: LIST_AUCTION_NFT_FAILURE,
  payload: error
});

export const cancelAuctionNft = (
  auctionId: string,
  priceOfNft: object,
  nftId: string | number,
  filters,
  pagination,
  user
) => ({
  type: CANCEL_AUCTION_NFT,
  payload: { auctionId, priceOfNft, filters, pagination, user, nftId }
});

export const cancelAuctionNftSuccess = (data: any) => ({
  type: CANCEL_AUCTION_NFT_SUCCESS,
  payload: data
});

export const cancelAuctionNftFailure = (error: string) => ({
  type: CANCEL_AUCTION_NFT_FAILURE,
  payload: error
});

export const bidAuctionNft = (
  auctionId: string,
  bidAmount: string,
  usdPrice: number,
  nftId: string | number
) => ({
  type: BID_NFT,
  payload: { auctionId, bidAmount, usdPrice, nftId }
});

export const bidNftSuccess = (data: any) => ({
  type: BID_NFT_SUCCESS,
  payload: data
});

export const bidNftFailure = (error: string) => ({
  type: BID_NFT_FAILURE,
  payload: error
});

export const acceptOffer = (
  auctionId: string,
  bidOffers,
  nftId: string | number,
  context: Constants.TABLE | Constants.PRICE_DETAILS
) => ({
  type: ACCEPT_OFFER,
  payload: { auctionId, bidOffers, nftId, context }
});

export const acceptOfferSuccess = (data: any) => ({
  type: ACCEPT_OFFER_SUCCESS,
  payload: data
});

export const acceptOfferFailure = (error: string) => ({
  type: ACCEPT_OFFER_FAILURE,
  payload: error
});

export const claimNft = (tokenId: string, nftId: string | number) => ({
  type: CLAIM_NFT,
  payload: { tokenId, nftId }
});

export const claimNftSuccess = (data: any) => ({
  type: CLAIM_NFT_SUCCESS,
  payload: data
});

export const claimNftFailure = (error: string) => ({
  type: CLAIM_NFT_FAILURE,
  payload: error
});

export const openListSuccessModal = () => ({
  type: OPEN_FIXED_LIST_SUCCESS_MODAL
});

export const closeListSuccessModal = () => ({
  type: CLOSE_FIXED_LIST_SUCCESS_MODAL
});

export const openBidSuccessModal = () => ({
  type: OPEN_BID_SUCCESS_MODAL
});

export const closeBidSuccessModal = () => ({
  type: CLOSE_BID_SUCCESS_MODAL
});

export const openAcceptBidSuccessModal = () => ({
  type: OPEN_ACCEPT_BID_SUCCESS_MODAL
});

export const closeAcceptBidSuccessModal = () => ({
  type: CLOSE_ACCEPT_BID_SUCCESS_MODAL
});

export const openClaimSuccessModal = () => ({
  type: OPEN_CLAIM_SUCCESS_MODAL
});

export const closeClaimSuccessModal = () => ({
  type: CLOSE_CLAIM_SUCCESS_MODAL
});

/* LOADINGS */
export const setBuyNftLoading = (nftId: string, loading: boolean) => ({
  type: SET_BUY_NFT_LOADING,
  payload: { nftId, loading }
});

export const setListNftLoading = (loading: boolean) => ({
  type: SET_LIST_NFT_LOADING,
  payload: loading
});

export const setCancelNftLoading = (nftId: string, loading: boolean) => ({
  type: SET_CANCEL_LOADING,
  payload: { nftId, loading }
});

export const setBidNftLoading = (loading: boolean) => ({
  type: SET_BID_LOADING,
  payload: { loading }
});

export const setAcceptNftLoading = (loading: boolean) => ({
  type: SET_ACCEPT_LOADING,
  payload: { loading }
});

export const setAcceptTableLoading = (loading: boolean) => ({
  type: SET_ACCEPT_TABLE_LOADING,
  payload: loading
});

export const setClaimLoading = (loading: boolean) => ({
  type: SET_CLAIM_LOADING,
  payload: { loading }
});
