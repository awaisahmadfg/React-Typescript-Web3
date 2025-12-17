import { Dispatch } from 'react';
import { ethers } from 'ethers';
import {
  estimateGasForListNFTApproval,
  getBalanceByType,
  provider
} from 'helpers/blockchain';
import { toastify } from 'pages/newContests/toastify';
import Actions from 'redux-state/actions';
import { ASSET_TYPES, ERRORS, VARIANT } from 'utilities/constants';
import { nftDetailActions } from '../nftDetailState/actions';
import { NftDetailAction } from '../nftDetailState/interfaces';
import { setListNftLoading } from 'redux-state/nftMarketplace/actions';

const DISPLAY_TIME = 2500;

export const estimateGasForListNFT = async (
  userPrivateKey: string,
  tokenId: string,
  marketplaceContract: string,
  dispatch: any,
  localDispatch: Dispatch<NftDetailAction>
): Promise<void> => {
  try {
    dispatch(setListNftLoading(tokenId, true));

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
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    dispatch(
      Actions.openTxApprovalModal({
        txApprovalModalObj: {
          type: ASSET_TYPES.NFT,
          open: true,
          gasFee: gas,
          walletAddress: wallet.address
        }
      })
    );
    localDispatch(nftDetailActions.setState({ showNftApprovalModal: true }));
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    dispatch(setListNftLoading(tokenId, false));
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
    dispatch(setListNftLoading(tokenId, true));

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
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    dispatch(
      Actions.openTxApprovalModal({
        txApprovalModalObj: {
          type: ASSET_TYPES.NFT,
          open: true,
          gasFee: gas,
          walletAddress: wallet.address
        }
      })
    );
    localDispatch(nftDetailActions.setState({ showNftApprovalModal: true }));
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    dispatch(setListNftLoading(tokenId, false));
  }
};
