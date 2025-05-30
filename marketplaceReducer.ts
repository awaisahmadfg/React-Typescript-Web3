/* eslint-disable */
import {
  BUY_NFT_SUCCESS,
  BUY_NFT_FAILURE,
  CANCEL_FIXED_NFT,
  CANCEL_FIXED_NFT_SUCCESS,
  CANCEL_FIXED_NFT_FAILURE,
  SET_BUY_NFT_LOADING,
  SET_LIST_NFT_LOADING,
  SET_CANCEL_LOADING,
  LIST_FIXED_NFT,
  LIST_FIXED_NFT_SUCCESS,
  LIST_FIXED_NFT_FAILURE,
  OPEN_FIXED_LIST_SUCCESS_MODAL,
  CLOSE_FIXED_LIST_SUCCESS_MODAL,
  LIST_AUCTION_NFT,
  LIST_AUCTION_NFT_SUCCESS,
  LIST_AUCTION_NFT_FAILURE,
  SET_TRANSACTION_HASH,
  SET_BID_LOADING,
  BID_NFT,
  BID_NFT_SUCCESS,
  BID_NFT_FAILURE,
  OPEN_BID_SUCCESS_MODAL,
  CLOSE_BID_SUCCESS_MODAL,
  CLEAR_TRANSACTION_HASH,
  SET_ACCEPT_LOADING,
  OPEN_ACCEPT_BID_SUCCESS_MODAL,
  CLOSE_ACCEPT_BID_SUCCESS_MODAL
} from './types';

const INITIAL_STATE = {
  acceptLoading: false,
  bidLoading: false,
  buyLoading: {},
  cancelLoading: {},
  claimLoading: false,
  listLoading: false,
  listSuccessModalOpen: false,
  bidSuccessModalOpen: false,
  acceptSuccessModalOpen: false,
  transactionHash: ''
};

const reducer = (state = INITIAL_STATE, action: any) => {
  switch (action.type) {
    case BUY_NFT_SUCCESS:
      return {
        ...state,
        buyLoading: false,
        transactionData: action.payload,
        error: null
      };
    case BUY_NFT_FAILURE:
      return { ...state, buyLoading: false, error: action.payload };
    case CANCEL_FIXED_NFT:
      return {
        ...state,
        cancelLoading: true
      };
    case CANCEL_FIXED_NFT_SUCCESS:
      return {
        ...state,
        cancelLoading: false,
        transactionData: action.payload,
        error: null
      };
    case CANCEL_FIXED_NFT_FAILURE:
      return { ...state, cancelLoading: false, error: action.payload };
    case LIST_FIXED_NFT:
      return {
        ...state,
        listLoading: true
      };
    case LIST_FIXED_NFT_SUCCESS:
      return {
        ...state,
        listLoading: false,
        transactionData: action.payload,
        error: null
      };
    case LIST_FIXED_NFT_FAILURE:
      return {
        ...state,
        listLoading: false,
        error: action.payload
      };
    case SET_TRANSACTION_HASH:
      return {
        ...state,
        transactionHash: action.payload
      };
    case CLEAR_TRANSACTION_HASH:
      return {
        ...state,
        transactionHash: ''
      };
    case LIST_AUCTION_NFT:
      return {
        ...state,
        listLoading: true
      };
    case LIST_AUCTION_NFT_SUCCESS:
      return {
        ...state,
        listLoading: false,
        transactionData: action.payload,
        error: null
      };
    case LIST_AUCTION_NFT_FAILURE:
      return {
        ...state,
        listLoading: false,
        error: action.payload
      };
    case BID_NFT:
      return {
        ...state,
        bidLoading: true
      };
    case BID_NFT_SUCCESS:
      return {
        ...state,
        bidLoading: false,
        transactionData: action.payload,
        error: null
      };
    case BID_NFT_FAILURE:
      return {
        ...state,
        bidLoading: false,
        error: action.payload
      };
    case OPEN_FIXED_LIST_SUCCESS_MODAL:
      return {
        ...state,
        listSuccessModalOpen: true
      };
    case CLOSE_FIXED_LIST_SUCCESS_MODAL:
      return {
        ...state,
        listSuccessModalOpen: false
      };
    case OPEN_BID_SUCCESS_MODAL:
      return {
        ...state,
        bidSuccessModalOpen: true
      };
    case CLOSE_BID_SUCCESS_MODAL:
      return {
        ...state,
        bidSuccessModalOpen: false
      };
    case OPEN_ACCEPT_BID_SUCCESS_MODAL:
      return {
        ...state,
        acceptSuccessModalOpen: true
      };
    case CLOSE_ACCEPT_BID_SUCCESS_MODAL:
      return {
        ...state,
        acceptSuccessModalOpen: false
      };
    case SET_BUY_NFT_LOADING:
      return {
        ...state,
        buyLoading: {
          ...state.buyLoading,
          [action.payload.nftId]: action.payload.loading
        }
      };
    case SET_LIST_NFT_LOADING:
      return {
        ...state,
        listLoading: action.payload
      };
    case SET_CANCEL_LOADING:
      return {
        ...state,
        cancelLoading: {
          ...state.cancelLoading,
          [action.payload.nftId]: action.payload.loading
        }
      };
    case SET_BID_LOADING:
      return {
        ...state,
        bidLoading: action.payload.loading,
      }
    case SET_ACCEPT_LOADING:
      return {
        ...state,
        acceptLoading: action.payload.loading,
      };
    default:
      return state;
  }
};

export default reducer;
