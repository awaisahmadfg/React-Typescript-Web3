import { Dispatch } from 'react';
import Config from 'config/config';
import { ethers } from 'ethers';
import { estimateGasForAuctionEnd, getBalanceByType } from 'helpers/blockchain';
import { toastify } from 'pages/newContests/toastify';
import Actions from 'redux-state/actions';
import { ASSET_TYPES, ERRORS, VARIANT } from 'utilities/constants';
import { nftDetailActions } from '../nftDetailState/actions';
import { NftDetailAction } from '../nftDetailState/interfaces';
import { checkBalanceAndToast } from 'components/NftCard/utils';
import { setAcceptNftLoading } from 'redux-state/nftMarketplace/actions';

const DISPLAY_TIME = 2500;
const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);

export const estimateGasForAccept = async (
  userPrivateKey: string,
  tokenId: string,
  dispatch: any,
  localDispatch: Dispatch<NftDetailAction>
): Promise<void> => {
  try {
    const hasSufficientBalance = await checkBalanceAndToast(userPrivateKey);
    if (!hasSufficientBalance) {
      dispatch(setAcceptNftLoading(false));
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      return;
    }
    dispatch(setAcceptNftLoading(true));
    const gas = await estimateGasForAuctionEnd(userPrivateKey, tokenId);

    const wallet = new ethers.Wallet(userPrivateKey, provider);
    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);
    if (userBalance < gas) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      dispatch(setAcceptNftLoading(false));
      return;
    }

    dispatch(
      Actions.openTxApprovalModal({
        txApprovalModalObj: {
          type: ASSET_TYPES.NFT,
          open: true,
          gasFee: gas
        }
      })
    );
    localDispatch(nftDetailActions.setState({ showNftApprovalModal: true }));
    dispatch(setAcceptNftLoading(false));
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    dispatch(setAcceptNftLoading(false));
  }
};
