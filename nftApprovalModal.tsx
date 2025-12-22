import { Dispatch } from 'react';
import { convertUsdToEth, nftApproval } from 'helpers/blockchain';
import Actions from 'redux-state/actions';
import { Constants, TRANSACTION_TYPE } from 'utilities/constants';
import {
  handleListNftApproval,
  handleListNftAuctionApproval,
  txReject
} from '.';
import {
  handleListNftAuctionTransaction,
  handleListNftTransaction
} from './handleListNFtTransaction';
import { nftDetailActions } from '../nftDetailState/actions';
import { NftDetailAction, NftDetailState } from '../nftDetailState/interfaces';
import { setListNftLoading } from 'redux-state/nftMarketplace/actions';

export function getTxApprovalModalProps({
  localDispatch,
  nftDetailState,
  dispatch,
  token,
  nftContract,
  listPrice,
  txApprovalModalObj,
  user,
  setListPrice,
  filters,
  pagination
}) {
  if (nftDetailState.showNftApprovalModal) {
    return {
      show: nftDetailState.showNftApprovalModal,
      onConfirm: () =>
        nftApprovalTransaction(
          localDispatch,
          nftDetailState,
          user.privateKey,
          token?.tokenId,
          listPrice,
          dispatch,
          user?.id
        ),
      onReject: () => txReject(localDispatch, dispatch, token?.tokenId),
      transactionType: TRANSACTION_TYPE.NFT_APPROVAL,
      open: txApprovalModalObj.open,
      type: txApprovalModalObj.type
    };
  } else if (
    nftDetailState.showListNftApprovalModal &&
    nftDetailState.saleType === Constants.FIXED
  ) {
    return {
      show: nftDetailState.showListNftApprovalModal,
      onConfirm: () =>
        handleListNftTransaction({
          user,
          token,
          nftContract,
          listPrice,
          dispatch,
          localDispatch,
          setListPrice,
          filters,
          pagination,
          nftDetailState
        }),
      onReject: () => txReject(localDispatch, dispatch, token?.tokenId),
      transactionType: TRANSACTION_TYPE.LIST_NFT,
      open: txApprovalModalObj.open,
      type: txApprovalModalObj.type
    };
  } else if (
    nftDetailState.showListNftApprovalModal &&
    nftDetailState.saleType === Constants.AUCTION
  ) {
    return {
      show: nftDetailState.showListNftApprovalModal,
      onConfirm: () =>
        handleListNftAuctionTransaction({
          user,
          token,
          nftContract,
          listPrice,
          dispatch,
          localDispatch,
          setListPrice,
          filters,
          pagination,
          nftDetailState
        }),
      onReject: () => txReject(localDispatch, dispatch, token?.tokenId),
      transactionType: TRANSACTION_TYPE.LIST_NFT,
      open: txApprovalModalObj.open,
      type: txApprovalModalObj.type
    };
  }
  return { show: false };
}

interface ReduxAction {
  type: string;
  payload?: unknown;
}
// eslint-disable-next-line no-unused-vars
type ReduxDispatch = (action: ReduxAction) => void;

const nftApprovalTransaction = async (
  localDispatch: Dispatch<NftDetailAction>,
  nftDetailState: NftDetailState,
  privateKey: string,
  tokenId: string,
  listPrice: number,
  dispatch: ReduxDispatch,
  userId: string | number
) => {
  try {
    dispatch(Actions.setModalClosable(false));
    localDispatch(nftDetailActions.setState({ showNftApprovalModal: false }));
    dispatch(
      Actions.openTxApprovalModal({
        txApprovalModalObj: {
          open: false,
          gasFee: '',
          type: ''
        }
      })
    );
    dispatch(Actions.setModalClosable(true));
    const usdToMatic = await convertUsdToEth(listPrice);
    localDispatch(nftDetailActions.setState({ maticPrice: usdToMatic }));

    const { getNftOwnerPrivateKey } = await import('helpers/blockchain');
    const ownerPrivateKey = await getNftOwnerPrivateKey(
      tokenId,
      String(userId),
      privateKey
    );

    await nftApproval(ownerPrivateKey, tokenId, dispatch);

    switch (nftDetailState.saleType) {
      case Constants.FIXED:
        await handleListNftApproval(
          localDispatch,
          ownerPrivateKey,
          tokenId,
          usdToMatic,
          dispatch,
          userId
        );
        break;

      case Constants.AUCTION:
        await handleListNftAuctionApproval(
          localDispatch,
          ownerPrivateKey,
          tokenId,
          usdToMatic,
          nftDetailState,
          dispatch
        );
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('Error in nftApprovalTransaction:', error);
    dispatch(setListNftLoading(tokenId, false));
    localDispatch(nftDetailActions.setState({ showNftApprovalModal: false }));
    localDispatch(
      nftDetailActions.setState({ showListNftApprovalModal: false })
    );
    throw error;
  }
};
