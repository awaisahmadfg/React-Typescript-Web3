import { Dispatch } from 'react';
import Config from 'config/config';
import { ethers } from 'ethers';
import {
  estimateGasForListNFTApproval,
  getBalanceByType
} from 'helpers/blockchain';
import { toastify } from 'pages/newContests/toastify';
import Actions from 'redux-state/actions';
import { ASSET_TYPES, ERRORS, VARIANT } from 'utilities/constants';
import { nftDetailActions } from '../nftDetailState/actions';
import { NftDetailAction } from '../nftDetailState/interfaces';

const DISPLAY_TIME = 2500;
const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);

export const estimateGasForListNFT = async (
  userPrivateKey: string,
  tokenId: string,
  marketplaceContract: string,
  dispatch: any,
  localDispatch: Dispatch<NftDetailAction>
): Promise<void> => {
  try {
    localDispatch(nftDetailActions.setState({ isLoading: true }));

    const gas = await estimateGasForListNFTApproval(
      userPrivateKey,
      tokenId,
      marketplaceContract
    );

    const wallet = new ethers.Wallet(userPrivateKey, provider);
    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);
    if (userBalance < gas) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      localDispatch(nftDetailActions.setState({ isLoading: false }));
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
    localDispatch(nftDetailActions.setState({ isLoading: false }));
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    localDispatch(nftDetailActions.setState({ isLoading: false }));
  }
};

export const estimateListNFTAuctionGas = async (
  userPrivateKey: string,
  tokenId: string,
  marketplaceContract: string,
  dispatch: any,
  localDispatch: Dispatch<NftDetailAction>
): Promise<void> => {
  try {
    localDispatch(nftDetailActions.setState({ isLoading: true }));

    const gas = await estimateGasForListNFTApproval(
      userPrivateKey,
      tokenId,
      marketplaceContract
    );

    const wallet = new ethers.Wallet(userPrivateKey, provider);
    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);
    if (userBalance < gas) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      localDispatch(nftDetailActions.setState({ isLoading: false }));
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
    localDispatch(nftDetailActions.setState({ isLoading: false }));
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    localDispatch(nftDetailActions.setState({ isLoading: false }));
  }
};
