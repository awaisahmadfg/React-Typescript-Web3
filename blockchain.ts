import { checkBalanceAndToast } from 'components/NftCard/utils';
import Config from 'config/config';
import { BigNumber, ethers } from 'ethers';
import { showToast } from 'components/common/Toast';
import Actions from 'redux-state/actions';
import {
  ASSET_TYPES,
  Constants,
  ERRORS,
  NUMBERS,
  RESOURCE,
  VARIANT
} from 'utilities/constants';
import { CustomError } from './CustomError';
import dataProvider from 'dataPrvider';
import { fetchAssetBalance } from './fetchAssetBalance';
import { workplaceFilter } from 'helpers/userTagsCache';

export { formatRoyaltyFull, formatRoyaltyShort } from './formatRoyalty';
export { convertEthToUsd, convertUsdToEth } from './exchangeRates';
export {
  fetchPublicBlockchainConfig,
  getBlockExplorerBaseUrl,
  getExplorerAddressUrl,
  getExplorerNftTokenUrl,
  getExplorerTxUrl,
  getPublicContract,
  preloadPublicBlockchainConfig
} from './publicBlockchainConfig';
import {
  setAcceptNftLoading,
  setAcceptTableLoading,
  setBidNftLoading,
  setBuyNftLoading,
  setCancelNftLoading,
  setClaimLoading,
  setConfirmButtonLoading,
  setListNftLoading
} from 'redux-state/nftMarketplace/actions';
import { Profile } from 'components/CardProfile';
import { Tag } from 'interface/common';
import {
  formatPaymentAmountFromAddress,
  isEthPaymentToken,
  parsePaymentAmount,
  paymentTokenTypeFromAddress
} from './paymentToken';

export const mindMinerOpsWalletAddress = Config.MINDMINER_OPS_WALLET_ADDRESS;

export const estimateGasForNft = async (
  recipientAddress: string,
  tokenURI: string
) => {
  try {
    const data = await dataProvider.estimateMarketplaceMintGas({
      recipientAddress,
      tokenURI
    });
    return data?.gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const estimateGasForListNft = async (
  walletAddress: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber,
  paymentToken: string
) => {
  try {
    if (!walletAddress) {
      throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
    }

    const data = await dataProvider.estimateMarketplaceListFixedGas({
      walletAddress,
      tokenId,
      listPriceWei: listPrice.toString(),
      paymentToken
    });
    return data?.gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATING_LIST_NFT, error);
    throw error;
  }
};

export const listNftTransaction = async (
  walletAddress: string,
  tokenId: string,
  listPrice: BigNumber,
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
  user: Profile,
  paymentToken: string
) => {
  if (!walletAddress) {
    throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
  }

  dispatch(
    Actions.listFixedNft(
      tokenId,
      listPrice,
      usdPrice,
      filters,
      pagination,
      user,
      walletAddress,
      paymentToken
    )
  );
};

export const estimateGasForListAuctionNft = async (
  walletAddress: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber,
  auctionStartTime: BigNumber,
  auctionEndTime: BigNumber,
  dispatch: any,
  paymentToken: string
) => {
  try {
    if (!walletAddress) {
      throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
    }

    const currentTime = BigNumber.from(Math.floor(Date.now() / 1000));

    if (auctionStartTime.lte(currentTime) || auctionEndTime.lte(currentTime)) {
      showToast(ERRORS.START_TIME_ERROR, VARIANT.ERROR);
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    if (auctionEndTime.lte(auctionStartTime)) {
      showToast(ERRORS.AUCTION_TIME_RANGE_ERROR, VARIANT.ERROR);
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    const data = await dataProvider.estimateMarketplaceListAuctionGas({
      walletAddress,
      tokenId,
      listPriceWei: listPrice.toString(),
      auctionStartTime: auctionStartTime.toNumber(),
      auctionEndTime: auctionEndTime.toNumber(),
      paymentToken
    });
    return data?.gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATING_LIST_NFT, error);
    throw error;
  }
};

export const listNftAuctionTransaction = async (
  walletAddress: string,
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
  user: Profile,
  paymentToken: string
) => {
  if (!walletAddress) {
    throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
  }

  const currentTime = BigNumber.from(Math.floor(Date.now() / 1000));

  if (auctionStartTime.lte(currentTime) || auctionEndTime.lte(currentTime)) {
    showToast(ERRORS.START_TIME_ERROR, VARIANT.ERROR);
    dispatch(setListNftLoading(tokenId, false));
    return;
  }

  if (auctionEndTime.lte(auctionStartTime)) {
    showToast(ERRORS.AUCTION_TIME_RANGE_ERROR, VARIANT.ERROR);
    dispatch(setListNftLoading(tokenId, false));
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
      user,
      walletAddress,
      paymentToken
    )
  );
};

export const checkUserBalance = async (
  privateKey: string
): Promise<boolean> => {
  try {
    // Encrypted keys cannot be used directly by ethers.Wallet
    if (privateKey && privateKey.includes(':')) {
      console.error(
        'checkUserBalance: Private key is encrypted, cannot check balance. Backend should decrypt it.'
      );
      return false;
    }

    if (
      !privateKey ||
      (!privateKey.startsWith('0x') && !/^[0-9a-fA-F]{64}$/u.test(privateKey))
    ) {
      console.error('checkUserBalance: Invalid private key format');
      return false;
    }

    const wallet = new ethers.Wallet(privateKey);

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);
    const userBalanceNumber = parseFloat(String(userBalance));

    if (userBalanceNumber === 0) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(ERRORS.USER_BALANCE_ERROR, error);
    showToast(ERRORS.INSUFFICIENT_BALANCE, VARIANT.ERROR);
    return false;
  }
};

export const checkNftExpiry = async (
  tokenId: string | number,
  dispatch?: any,
  setLoading?: (id: string | number, loading: boolean) => void,
  tokenIdForLoading?: string | number
): Promise<boolean> => {
  try {
    const data = await dataProvider.getMarketplaceNftExpiry(String(tokenId));
    if (data?.expired) {
      showToast(Constants.NFT_EXPIRED, VARIANT.ERROR);
      if (setLoading && tokenIdForLoading !== undefined) {
        setLoading(tokenIdForLoading, false);
      }
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking NFT expiry:', error);
    return false;
  }
};

export const getNftOwnerAddress = async (tokenId: string): Promise<string> => {
  try {
    const data = await dataProvider.getMarketplaceNftOwner(tokenId);
    if (!data?.ownerAddress) {
      throw new Error('NFT owner not found');
    }
    return String(data.ownerAddress).toLowerCase();
  } catch (error) {
    console.error('Error in getNftOwnerAddress:', error);
    throw error;
  }
};

export const getNftOwnerPrivateKey = async (
  tokenId: string,
  userId: string,
  userPrivateKey: string | undefined
): Promise<string> => {
  try {
    const nftOwnerAddress = await getNftOwnerAddress(tokenId);

    // Check if user has a company/tag
    const tags = await dataProvider.getList<Tag>('tags', {
      filter: workplaceFilter(userId),
      pagination: undefined,
      sort: undefined
    });

    let privateKey: string | undefined;
    let ownerAddress: string | undefined;

    // Check if NFT is owned by the user's tag (first tag)
    if (tags?.data?.[0]) {
      privateKey = tags?.data?.[0]?.privateKey;
      ownerAddress = tags?.data?.[0]?.walletAddress?.toLowerCase();
    } else {
      privateKey = userPrivateKey;
      if (userPrivateKey) {
        // Check if NFT is owned by user wallet
        const userWallet = new ethers.Wallet(userPrivateKey);
        ownerAddress = userWallet.address.toLowerCase();
      }
    }

    if (!privateKey) {
      throw new Error(
        "No private key found. Ensure the correct wallet is connected or the tag's private key is available."
      );
    }

    if (!ownerAddress || ownerAddress !== nftOwnerAddress) {
      throw new Error(
        `Patent Token is not owned by the user or their tag. Patent Token owner: ${nftOwnerAddress}, Expected: ${ownerAddress || 'unknown'}`
      );
    }

    return privateKey;
  } catch (error) {
    console.error('Error in getNftOwnerPrivateKey:', error);
    throw error;
  }
};

export const getListingOwnerAddress = async (
  fixedId: string
): Promise<string> => {
  try {
    const data = await dataProvider.getMarketplaceFixedPrice(fixedId);
    return String(data?.fixedPrice?.owner).toLowerCase();
  } catch (error) {
    console.error(
      '[CANCEL FIXED] Error fetching fixed price listing data:',
      error
    );
    throw error;
  }
};

export const getAuctionOwnerAddress = async (
  auctionId: string
): Promise<string> => {
  try {
    const data = await dataProvider.getMarketplaceAuction(auctionId);
    return String(data?.auction?.patentTokenOwner).toLowerCase();
  } catch (error) {
    console.error('🔴 [CANCEL AUCTION] Error fetching auction data:', error);
    throw error;
  }
};

export const getWalletAddressForListingOwner = async (
  ownerAddress: string,
  userId: string,
  userWalletAddress?: string
): Promise<string | null> => {
  const tags = await dataProvider.getList<Tag>('tags', {
    filter: workplaceFilter(userId),
    pagination: undefined,
    sort: undefined
  });

  if (tags?.data?.[0]?.walletAddress) {
    const tagWalletAddress = tags.data[0].walletAddress.toLowerCase();
    if (tagWalletAddress === ownerAddress.toLowerCase()) {
      return tags.data[0].walletAddress;
    }
  }

  if (
    userWalletAddress &&
    userWalletAddress.toLowerCase() === ownerAddress.toLowerCase()
  ) {
    return userWalletAddress;
  }

  console.error('[CANCEL] ERROR: No matching wallet found!', {
    ownerAddress,
    userWalletAddress,
    tagWalletAddress: tags?.data?.[0]?.walletAddress?.toLowerCase(),
    userId
  });

  return null;
};

export const getPrivateKeyForListingOwner = async (
  ownerAddress: string,
  userId: string,
  userPrivateKey: string | undefined
): Promise<string> => {
  const tags = await dataProvider.getList<Tag>('tags', {
    filter: workplaceFilter(userId),
    pagination: undefined,
    sort: undefined
  });

  // Check if owner is a company wallet
  if (tags?.data?.[0]?.walletAddress && tags.data[0].privateKey) {
    const tagWalletAddress = tags.data[0].walletAddress.toLowerCase();
    if (tagWalletAddress === ownerAddress.toLowerCase()) {
      return tags.data[0].privateKey;
    }
  }

  if (userPrivateKey) {
    try {
      const userWallet = new ethers.Wallet(userPrivateKey);
      const userWalletAddress = userWallet.address.toLowerCase();

      if (userWalletAddress === ownerAddress.toLowerCase()) {
        return userPrivateKey;
      }
    } catch (error) {
      console.error(
        '[getPrivateKeyForListingOwner] Error creating wallet:',
        error
      );
    }
  }

  console.error('[CANCEL] ERROR: No matching wallet found!', {
    ownerAddress,
    userPrivateKey: userPrivateKey ? 'provided' : 'undefined',
    tagWalletAddress: tags?.data?.[0]?.walletAddress?.toLowerCase(),
    userId
  });

  throw new Error(
    `Wallet address does not match listing owner ${ownerAddress}`
  );
};

export const estimateGasForBuyNft = async (
  walletAddress: string,
  fixedId: string
) => {
  try {
    const data = await dataProvider.estimateMarketplaceBuyGas({
      walletAddress,
      fixedId
    });
    return data?.gasFeeEther;
  } catch (error) {
    console.error('Error in estimateGasForBuyNft:', error);
    throw error;
  }
};

export const buyNftTransaction = async (
  walletAddress: string,
  fixedId: string,
  dispatch,
  filters,
  pagination,
  user,
  context?: 'marketplace' | 'nftDetail' | 'owned' | 'company'
) => {
  try {
    if (!walletAddress) {
      throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
    }

    const priceDataResponse =
      await dataProvider.getMarketplaceFixedPrice(fixedId);
    const priceData = priceDataResponse?.fixedPrice;
    if (!priceData) {
      throw new Error('Fixed price listing not found');
    }

    const tokenId = Number(priceData.tokenId);
    const isExpired = await checkNftExpiry(
      tokenId,
      dispatch,
      setBuyNftLoading,
      fixedId
    );
    if (isExpired) {
      return;
    }

    dispatch(
      Actions.buyNft(
        fixedId,
        priceData.patentTokenPrice,
        filters,
        pagination,
        user,
        walletAddress,
        context
      )
    );
  } catch (error) {
    console.error('Error in buyNft:', error);
    throw error;
  }
};

// Estimate gas for bid using wallet address (read-only, no private key needed)
export const estimateGasForBidNftByAddress = async (
  walletAddress: string,
  auctionId: string,
  newBidAmount: string,
  _dispatch: any,
  _userBalance?: string | number
): Promise<string> => {
  const data = await dataProvider.estimateMarketplaceBidGas({
    walletAddress,
    auctionId,
    bidAmount: newBidAmount
  });
  return data?.gasFeeEther;
};

export const bidNftTransaction = async (
  privateKey: string,
  auctionId: string,
  newBidAmount: string,
  usdPrice: number,
  dispatch,
  nftId: string | number,
  userId?: string | number
) => {
  const wallet = new ethers.Wallet(privateKey);
  return bidNftTransactionWithWalletAddress(
    wallet.address,
    auctionId,
    newBidAmount,
    usdPrice,
    dispatch,
    nftId
  );
};

export const bidNftTransactionWithWalletAddress = async (
  walletAddress: string,
  auctionId: string,
  newBidAmount: string,
  usdPrice: number,
  dispatch,
  nftId: string | number
) => {
  try {
    if (!walletAddress) {
      throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
    }

    dispatch(
      Actions.bidAuctionNft(
        auctionId,
        String(newBidAmount),
        usdPrice,
        nftId,
        walletAddress
      )
    );
  } catch (error) {
    console.error('Error in bid NFT transaction:', error);
    throw error;
  }
};

export const estimateGasForCancelNft = async (
  fixedId: string
): Promise<{ gasFeeEther: string; listingOwnerAddress: string }> => {
  try {
    const data = await dataProvider.estimateMarketplaceCancelFixedGas({
      fixedId
    });
    return {
      gasFeeEther: data?.gasFeeEther ?? '0',
      listingOwnerAddress: data?.listingOwnerAddress
    };
  } catch (error) {
    console.error(ERRORS.CANCEL_FIXED_GAS_ESTIMATE, error);
    throw error;
  }
};

export const cancelNftTransaction = async (
  fixedId: string,
  dispatch,
  filters,
  pagination,
  user
) => {
  try {
    const priceDataResponse =
      await dataProvider.getMarketplaceFixedPrice(fixedId);
    const priceData = priceDataResponse?.fixedPrice;
    if (!priceData) {
      throw new Error('Fixed price listing not found');
    }

    const tokenId = Number(priceData.tokenId);
    const isExpired = await checkNftExpiry(
      tokenId,
      dispatch,
      setCancelNftLoading,
      fixedId
    );
    if (isExpired) {
      return;
    }

    dispatch(
      Actions.cancelFixedNft(
        fixedId,
        priceData.patentTokenPrice,
        filters,
        pagination,
        user
      )
    );
  } catch (error) {
    console.error(ERRORS.CANCEL_FIXED_TRANSACTION, error);
    throw error;
  }
};

export const estimateGasForCancelAuctionNft = async (listingId: string) => {
  try {
    const data = await dataProvider.estimateMarketplaceCancelAuctionGas({
      listingId
    });
    return {
      gasFeeEther: data?.gasFeeEther ?? '0',
      auctionOwnerAddress: data?.auctionOwnerAddress
    };
  } catch (error) {
    console.error(ERRORS.CANCEL_AUCTION_GAS_ESTIMATE, error);
    throw error;
  }
};

export const cancelNftAuctionTransaction = async (
  listingId: string,
  dispatch,
  nftId: string | number,
  filters,
  pagination,
  user
) => {
  try {
    const auctionResponse = await dataProvider.getMarketplaceAuction(listingId);
    const priceData = auctionResponse?.auction;
    if (!priceData) {
      throw new Error('Auction listing not found');
    }

    const tokenId = Number(priceData.tokenId);
    const isExpired = await checkNftExpiry(
      tokenId,
      dispatch,
      setCancelNftLoading,
      listingId
    );
    if (isExpired) {
      return;
    }

    dispatch(
      Actions.cancelAuctionNft(
        listingId,
        priceData.initialPrice,
        nftId,
        filters,
        pagination,
        user
      )
    );
  } catch (error) {
    console.error(ERRORS.CANCEL_AUCTIION_TRANSACTION, error);
    throw error;
  }
};

export type ClaimWalletResolution = {
  walletAddress: string;
  onChainCurrentBidder: string;
  userWallet?: string;
  tagWallet?: string;
};

/** Pick the user/company wallet that matches on-chain highest bidder for claim. */
export const resolveClaimWalletForAuction = async (
  auctionId: string,
  options: {
    userWalletAddress?: string;
    tagWalletAddress?: string;
  }
): Promise<ClaimWalletResolution> => {
  const data = await dataProvider.getMarketplaceAuction(String(auctionId));
  const onChainCurrentBidder = data?.auction?.currentBidder as string;

  if (
    !onChainCurrentBidder ||
    onChainCurrentBidder.toLowerCase() ===
      ethers.constants.AddressZero.toLowerCase()
  ) {
    throw new Error('No winning bidder on-chain for this auction.');
  }

  const bidderLower = onChainCurrentBidder.toLowerCase();
  const { userWalletAddress, tagWalletAddress } = options;

  const candidates = [userWalletAddress, tagWalletAddress].filter(
    (address): address is string => Boolean(address)
  );

  const matchedWallet = candidates.find(
    (address) => address.toLowerCase() === bidderLower
  );

  if (!matchedWallet) {
    throw new Error(
      'Claim must use the wallet that placed the winning bid. Your profile and company wallets do not match the on-chain highest bidder.'
    );
  }

  return {
    walletAddress: matchedWallet,
    onChainCurrentBidder,
    userWallet: userWalletAddress,
    tagWallet: tagWalletAddress
  };
};

export const estimateGasForClaimNftByAddress = async (
  walletAddress: string,
  auctionId: string
): Promise<string> => {
  const data = await dataProvider.estimateMarketplaceClaimGas({
    walletAddress,
    auctionId
  });
  return data?.gasFeeEther;
};

export const claimNftTransaction = async (
  privateKey: string,
  auctionId: string,
  dispatch: any,
  nftId: string | number,
  userId?: string | number
) => {
  const wallet = new ethers.Wallet(privateKey);
  return claimNftTransactionWithWalletAddress(
    wallet.address,
    auctionId,
    dispatch,
    nftId
  );
};

export const claimNftTransactionWithWalletAddress = async (
  walletAddress: string,
  auctionId: string,
  dispatch: any,
  nftId: string | number
) => {
  try {
    dispatch(Actions.claimNft(auctionId, nftId, walletAddress));
  } catch (error) {
    console.error(ERRORS.CLAIM_NFT_TRANSACTION, error);
    throw error;
  }
};

export const estimateGasForListNFTApproval = async (
  walletAddress: string,
  tokenId: string,
  _marketplaceAddress: string
) => {
  try {
    if (!walletAddress) {
      throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
    }

    const data = await dataProvider.estimateMarketplaceNftApprovalGas({
      walletAddress,
      tokenId
    });
    return data?.gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const deployNftChecks = async (
  privateKey: string,
  tokenURI: string,
  dispatch: any
) => {
  const signer = new ethers.Wallet(privateKey);

  const hasSufficientBalance = await checkBalanceAndToast(signer.address);
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

  const gasFeeEstimate = await estimateGasForNft(signer.address, tokenURI);

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, signer.address);

  const requiredBalance = parseFloat(gasFeeEstimate) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    showToast(ERRORS.INSUFFICIENT_BALANCE, VARIANT.ERROR);
    dispatch(
      Actions.openTransakBuyModal({
        openTransakBuyModalObj: {
          open: true
        }
      })
    );
    return;
  }
};

export const nftApproval = async (
  walletAddress: string,
  tokenId: string,
  dispatch
) => {
  if (!walletAddress) {
    throw new Error(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND);
  }

  try {
    await dataProvider.nftApproval(tokenId, walletAddress);
    dispatch(setConfirmButtonLoading(false));
  } catch (error) {
    console.error('Error in nftApproval:', error);
    dispatch(setConfirmButtonLoading(false));
    dispatch(setListNftLoading(tokenId, false));
    throw error;
  }
};

export const initDeployNFT = async (
  tokenURI,
  openTxApprovalModal,
  walletAddress,
  dispatch
) => {
  try {
    if (!walletAddress) {
      throw new CustomError(ERRORS.MARKETPLACE_SIGNING_WALLET_NOT_FOUND, 400);
    }

    const userBalance = await getBalanceByType(
      ASSET_TYPES.ETHEREUM,
      walletAddress
    );
    const userBalanceNumber = parseFloat(String(userBalance));

    if (userBalanceNumber === 0) {
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      throw new CustomError(ERRORS.INSUFFICIENT_BALANCE, 403);
    }

    let gasFeeEstimate;
    try {
      gasFeeEstimate = await estimateGasForNft(walletAddress, tokenURI);
    } catch (gasError) {
      console.error('Gas estimation failed:', gasError);
      showToast(
        'Failed to estimate gas fees. Please check your network connection and try again.',
        VARIANT.ERROR
      );
      throw new CustomError(
        gasError?.message || 'Gas estimation failed. Please try again.',
        503
      );
    }

    if (userBalance < gasFeeEstimate) {
      showToast(ERRORS.INSUFFICIENT_BALANCE, VARIANT.ERROR);
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      return;
    }

    openTxApprovalModal(gasFeeEstimate, ASSET_TYPES.NFT, walletAddress);
  } catch (error) {
    console.error('Error in initDeployNFT:', error);
    throw error;
  }
};

export const getBalanceByType = async (type: string, address: string) => {
  return fetchAssetBalance(type, address);
};

export const getMinimumBidAmount = async (
  auctionId: string
): Promise<number | undefined> => {
  try {
    const data = await dataProvider.getMarketplaceAuction(auctionId);
    return data?.auction?.minBidAmount;
  } catch (error) {
    console.error('Error fetching minimum bid amount:', error);
    return undefined;
  }
};

export const formatTokenAmount = (
  value: string | number | null | undefined,
  showCustomDP?: number
) => {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);

  let fixed = num.toFixed(showCustomDP ?? 18);

  if (showCustomDP) {
    fixed = fixed.replace(/(\.\d*?[1-9])0+$/u, '$1');
  } else {
    fixed = fixed.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '.00');
  }

  return fixed;
};

export const getUsdtAllowanceForAddress = async (
  owner: string,
  spender: string = Config.MARKETPLACE_CONTRACT_ADDRESS
): Promise<ethers.BigNumber> => {
  const data = await dataProvider.getMarketplaceUsdtAllowance(owner, spender);
  return ethers.BigNumber.from(data?.allowance ?? 0);
};

export const isUsdtAllowanceError = (error: unknown): boolean => {
  const errorData =
    (error as { error?: { data?: string }; data?: string })?.error?.data ??
    (error as { data?: string })?.data;
  return typeof errorData === 'string' && errorData.startsWith('0xfb8f41b2');
};

export type NftTitleInfo = { title: string; nftId: string };

export const getNftTitlesByTokenIds = async (
  tokenIds: string[]
): Promise<Record<string, NftTitleInfo>> => {
  const uniqueIds = [...new Set(tokenIds)];
  if (uniqueIds.length === 0) return {};
  try {
    const { data }: any = await dataProvider.getList(RESOURCE.NFTS, {
      filter: { tokenId: { $in: uniqueIds } },
      pagination: { page: 0, perPage: uniqueIds.length }
    });
    return data.reduce(
      (
        map: Record<string, NftTitleInfo>,
        nft: { tokenId?: string; name?: string; id?: string }
      ) => {
        if (nft.tokenId) {
          map[nft.tokenId] = {
            title: nft.name || `NFT #${nft.tokenId}`,
            nftId: nft.id || ''
          };
        }
        return map;
      },
      {} as Record<string, NftTitleInfo>
    );
  } catch (error) {
    console.error('Error fetching NFT titles from DB:', error);
    return uniqueIds.reduce(
      (map: Record<string, NftTitleInfo>, id: string) => {
        map[id] = { title: `NFT #${id}`, nftId: '' };
        return map;
      },
      {} as Record<string, NftTitleInfo>
    );
  }
};

export const fetchNftMetadata = async (
  metadataUrl: string
): Promise<{ image: string | null; name: string }> => {
  try {
    const response = await fetch(metadataUrl);
    if (!response.ok) {
      throw new Error(ERRORS.FETCH_METADATA);
    }
    const metadata = await response.json();
    const imageUrl = metadata.image ? metadata.image[0] : null;
    const name = metadata.name ? metadata.name : '';
    return { image: imageUrl, name };
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    return { image: null, name: '' };
  }
};

export const getOriginalCreator = async (tokenId: string) => {
  const data = await dataProvider.getMarketplaceRoyaltyReceiver(tokenId);
  return data?.royaltyReceiver;
};

export const getOriginalCreatorRoyalty = async (tokenId: string) => {
  const data = await dataProvider.getMarketplaceFixedPrice(tokenId);
  return data?.fixedPrice?.royaltyFeePercentage;
};

export const getCurrentBidAmount = async (tokenId: string) => {
  const data = await dataProvider.getMarketplaceAuction(tokenId);
  return ethers.BigNumber.from(data?.auction?.currentBidAmount ?? 0);
};

export const getAuctionPaymentToken = async (tokenId: string) => {
  const data = await dataProvider.getMarketplaceAuction(tokenId);
  return data?.auction?.paymentToken as string;
};

export const getNftAuctionExpireTime = async (tokenId: string) => {
  const data = await dataProvider.getMarketplaceAuction(tokenId);
  return ethers.BigNumber.from(data?.auction?.auctionEndTime ?? 0);
};
