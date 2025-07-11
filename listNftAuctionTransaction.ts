export const listNftAuctionTransaction = async (
  privateKey: string,
  tokenId: string,
  listPrice: BigNumber,
  auctionStartTime: BigNumber,
  auctionEndTime: BigNumber,
  dispatch,
  usdPrice: number,
  filters: {
    status: string;
    priceRange: {
      min: null | number;
      max: null | number;
    };
  },
  pagination: { page: number; perPage: number },
  user: Profile
) => {
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

  const signer = new ethers.Wallet(privateKey, provider);

  const hasSufficientBalance = await checkBalanceAndToast(privateKey);
  if (!hasSufficientBalance) {
    dispatch(
      Actions.openTransakBuyModal({
        openTransakBuyModalObj: {
          open: true
        }
      })
    );
    return;
  }

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, signer.address);

  const gas = await estimateGasForListNFTApproval(
    privateKey,
    tokenId,
    Config.MARKETPLACE_CONTRACT_ADDRESS
  );

  const requiredBalance = parseFloat(gas) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_RIGHT,
      DISPLAY_TIME
    );
    dispatch(setListNftLoading(tokenId, false));
    dispatch(
      Actions.openTransakBuyModal({
        openTransakBuyModalObj: {
          open: true
        }
      })
    );
    return;
  }

  dispatch(
    Actions.listAuctionNft(
      listPrice,
      auctionStartTime,
      auctionEndTime,
      tokenId,
      usdPrice,
      filters,
      pagination,
      user
    )
  );
};
