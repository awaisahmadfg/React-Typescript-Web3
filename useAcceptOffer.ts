import { useCallback } from 'react';
import { BUTTON_TYPES } from 'utilities/constants';
import { estimateGasForAccept } from '../../utils/estimateGasForAccept';
import { nftDetailActions } from '../../nftDetailState/actions';
import { Token } from 'interface/common';

export const useAcceptOffer = (
  user: any,
  nft: Token,
  dispatch: any,
  localDispatch: any
) => {
  return useCallback(
    async (bidOwner: string | number | null) => {
      localDispatch(nftDetailActions.setState({ bidOwner }));
      localDispatch(nftDetailActions.setState({ buttonType: BUTTON_TYPES.ACCEPT }));
      await estimateGasForAccept(user.privateKey, nft?.tokenId, dispatch, localDispatch);
    },
    [user.privateKey, nft?.tokenId, dispatch, localDispatch]
  );
};
