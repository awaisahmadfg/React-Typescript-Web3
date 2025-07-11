export const estimateGasForListAuctionNft = async (
  privateKey: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber,
  auctionStartTime: BigNumber,
  auctionEndTime: BigNumber,
  dispatch: any
) => {
  try {
    const currentTime = BigNumber.from(Math.floor(Date.now() / 1000));

    if (auctionStartTime < currentTime) {
      toastify(
        ERRORS.START_TIME_ERROR,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.listItemForAuction(
        listPrice,
        auctionStartTime,
        auctionEndTime,
        tokenId,
        nftContract
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATING_LIST_NFT, error);
    throw error;
  }
};
