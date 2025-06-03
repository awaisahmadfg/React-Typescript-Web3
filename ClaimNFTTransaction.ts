import { Dispatch } from 'react';
import { Profile } from 'components/CardProfile';
import { claimNftTransaction } from 'helpers/blockchain';
import { Token } from 'interface/common';
import Actions from 'redux-state/actions';
import { ERRORS } from 'utilities/constants';
import { nftDetailActions } from '../nftDetailState/actions';
import { NftDetailAction } from '../nftDetailState/interfaces';
import { setClaimLoading } from 'redux-state/nftMarketplace/actions';

export const claimNFTransaction = async (
  user: Profile,
  token: Token,
  localDispatch: Dispatch<NftDetailAction>,
  dispatch
) => {
  dispatch(setClaimLoading(true));
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

  try {
    await claimNftTransaction(
      user.privateKey,
      token.tokenId,
      dispatch,
      token._id
    );
    dispatch(Actions.setModalClosable(true));
    localDispatch(nftDetailActions.setState({ buttonType: null }));
  } catch (error) {
    localDispatch(
      nftDetailActions.setState({
        networkResponse: {
          status: 'error',
          message: ERRORS.TRANSACTION_FAILED
        }
      })
    );
    localDispatch(nftDetailActions.setState({ buttonType: null }));
    dispatch(setClaimLoading(false));
  }
};
