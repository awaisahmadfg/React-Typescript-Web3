export const handleListNftAuctionApproval = async (
  localDispatch: Dispatch<NftDetailAction>,
  privateKey: string,
  tokenId: string,
  listPrice: number,
  nftDetailState: NftDetailState,
  dispatch: any
) => {
  try {
    const currentTime = new Date();
    const startTime = nftDetailState.startDate;

    if (startTime < currentTime) {
      toastify(
        ERRORS.START_TIME_ERROR,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    const MILLISECONDS_IN_SECOND = 1000;
    dispatch(setListNftLoading(tokenId, true));

    const priceInWei = ethers.utils.parseUnits(
      listPrice.toString(),
      Constants.ETHER
    );

    const gas = await estimateGasForListAuctionNft(
      privateKey,
      tokenId,
      Config.NFT_CONTRACT_ADDRESS,
      priceInWei,
      ethers.BigNumber.from(
        Math.floor(nftDetailState.startDate.getTime() / MILLISECONDS_IN_SECOND)
      ),
      ethers.BigNumber.from(
        Math.floor(nftDetailState.endDate.getTime() / MILLISECONDS_IN_SECOND)
      ),
      dispatch
    );

    const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);
    if (userBalance < gas) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      dispatch(setListNftLoading(tokenId, false));
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
    localDispatch(
      nftDetailActions.setState({ showListNftApprovalModal: true })
    );
    dispatch(setListNftLoading(tokenId, false));
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    dispatch(setListNftLoading(tokenId, false));
    throw error;
  }
};
