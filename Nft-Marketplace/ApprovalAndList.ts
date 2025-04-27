import { setModalClosable } from 'redux-state/commons/actions';
import { nftDetailActions } from '../nftDetailState/actions';
import Actions from 'redux-state/actions';
import { convertUsdToMatic, nftApproval } from 'helpers/blockchain';
import { Constants } from 'utilities/constants';
import {
  handleListNftAuctionTransaction,
  handleListNftTransaction
} from './handleListNFtTransaction';

export const approveAndList = async ({
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
}) => {
  try {
    localDispatch(nftDetailActions.setState({ isLoading: true }));
    dispatch(setModalClosable(false));
    localDispatch(nftDetailActions.setState({ showNftApprovalModal: false }));
    dispatch(
      Actions.openTxApprovalModal({
        txApprovalModalObj: { open: false, gasFee: '', type: '' }
      })
    );

    /* 1️⃣ approval */
    await nftApproval(user.privateKey, token.tokenId, localDispatch);

    /* 2️⃣ price conversion once */
    const maticPrice = await convertUsdToMatic(listPrice);
    localDispatch(nftDetailActions.setState({ maticPrice }));

    /* 3️⃣ listing, no extra modal */
    const commonArgs = {
      user,
      token,
      nftContract,
      listPrice,
      dispatch,
      localDispatch,
      setListPrice,
      filters,
      pagination,
      nftDetailState: { ...nftDetailState, maticPrice }
    };

    if (nftDetailState.saleType === Constants.AUCTION) {
      await handleListNftAuctionTransaction(commonArgs);
    } else {
      await handleListNftTransaction(commonArgs);
    }
  } finally {
    dispatch(setModalClosable(true));
    localDispatch(nftDetailActions.setState({ isLoading: false }));
  }
};
