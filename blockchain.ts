import { checkBalanceAndToast } from 'components/NftCard/utils';
import Config from 'config/config';
import IdeaCoinABI from 'contract/IdeaCoins.json';
import MarketplaceAbi from 'contract/IdeaMarketplace.json';
import NftAbi from 'contract/IdeaNft.json';
import { BigNumber, ethers } from 'ethers';
import { toastify } from 'pages/newContests/toastify';
import Actions from 'redux-state/actions';
import {
  ASSET_TYPES,
  Constants,
  CURRENCIES,
  ERRORS,
  NUMBERS,
  VARIANT
} from 'utilities/constants';
import { CustomError } from './CustomError';
import dataProvider from 'dataPrvider';
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

export const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);
const wallet = new ethers.Wallet(Config.PRIVATE_KEY, provider);

const ideaCoinContract = new ethers.Contract(
  Config.IDEACOIN_CONTRACT_ADDRESS,
  IdeaCoinABI,
  wallet
);

interface Rates {
  [key: string]: string;
}

export type Chain = {
  chainId: string;
  name: string;
  blockExplorerUrl: string;
  rpcUrl: string;
};

export const sepolia: Chain = {
  chainId: Config.RPC_TEST_CHAIN_ID,
  name: Config.SEPOLIA_TESTNET_NAME,
  blockExplorerUrl: Config.ETHERSCAN_BASE_URL,
  rpcUrl: Config.INFURA_URL
};

export const mainnet: Chain = {
  chainId: Config.RPC_CHAIN_ID,
  name: Config.POLYGON_MAINNET_NAME,
  blockExplorerUrl: Config.POLYGON_EXPLORER_URL,
  rpcUrl: Config.MAINNET_INFURA_URL
};

export const CHAINS_CONFIG = {
  [sepolia.chainId]: sepolia,
  [mainnet.chainId]: mainnet
};

const nftContract = new ethers.Contract(
  Config.NFT_CONTRACT_ADDRESS,
  NftAbi,
  wallet
);

const marketplaceContract = new ethers.Contract(
  Config.MARKETPLACE_CONTRACT_ADDRESS,
  MarketplaceAbi,
  wallet
);

const DISPLAY_TIME = 2500;

export const getOwnedNfts = async (address: string) => {
  const nfts = await nftContract.balanceOf(address);
  return nfts.toNumber();
};

export const calculateGasFee = async (gasEstimate) => {
  try {
    if (!gasEstimate) {
      console.error('Gas estimate is undefined');
      return undefined;
    }
    const gasPrice = await provider.getGasPrice();
    if (!gasPrice) {
      console.error('Gas price is undefined');
      return undefined;
    }
    const gasFee = gasEstimate.mul(gasPrice);
    // Ensure we convert BigNumber to string before returning
    return ethers.utils.formatUnits(gasFee, Constants.ETHER);
  } catch (error) {
    console.error(ERRORS.GAS_FEE, error);
    return undefined;
  }
};

export const estimateGasForNft = async (tokenURI: string) => {
  try {
    const gasEstimate = await nftContract.estimateGas.mintNFT(tokenURI);
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const estimateGasForApproval = async (
  spender: string,
  amount: BigNumber | string | number
) => {
  try {
    let amountBN: BigNumber;
    if (BigNumber.isBigNumber(amount)) {
      amountBN = amount;
    } else {
      const decimals = await ideaCoinContract.decimals();
      if (typeof amount === 'string' || typeof amount === 'number') {
        amountBN = ethers.utils.parseUnits(amount.toString(), decimals);
      } else {
        throw new Error('Invalid amount type');
      }
    }

    const gasEstimate = await ideaCoinContract.estimateGas.approve(
      spender,
      amountBN
    );
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const estimateGasForListNft = async (
  walletAddress: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.listNftForFixedPrice(
        tokenId,
        listPrice,
        nftContract,
        { from: walletAddress }
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
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
  user: Profile
) => {
  if (!walletAddress) {
    throw new Error('Wallet address is required');
  }

  const hasSufficientBalance = await checkBalanceAndToast(walletAddress);
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

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, walletAddress);

  const gas = await estimateGasForListNFTApproval(
    walletAddress,
    tokenId,
    Config.MARKETPLACE_CONTRACT_ADDRESS
  );

  const requiredBalance = parseFloat(gas) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
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
    Actions.listFixedNft(
      tokenId,
      listPrice,
      usdPrice,
      filters,
      pagination,
      user,
      walletAddress
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
  dispatch: any
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const isExpired = await checkNftExpiry(
      tokenId,
      dispatch,
      setListNftLoading,
      tokenId
    );
    if (isExpired) {
      return;
    }

    const currentTime = BigNumber.from(Math.floor(Date.now() / 1000));

    if (auctionStartTime.lte(currentTime) || auctionEndTime.lte(currentTime)) {
      toastify(
        ERRORS.START_TIME_ERROR,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    if (auctionEndTime.lte(auctionStartTime)) {
      toastify(
        ERRORS.AUCTION_TIME_RANGE_ERROR,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(setListNftLoading(tokenId, false));
      return;
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.listItemForAuction(
        listPrice,
        auctionStartTime,
        auctionEndTime,
        tokenId,
        nftContract,
        { from: walletAddress }
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
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
  user: Profile
) => {
  if (!walletAddress) {
    throw new Error('Wallet address is required');
  }

  const isExpired = await checkNftExpiry(
    tokenId,
    dispatch,
    setListNftLoading,
    tokenId
  );
  if (isExpired) {
    return;
  }

  const currentTime = BigNumber.from(Math.floor(Date.now() / 1000));

  if (auctionStartTime.lte(currentTime) || auctionEndTime.lte(currentTime)) {
    toastify(
      ERRORS.START_TIME_ERROR,
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
      DISPLAY_TIME
    );
    dispatch(setListNftLoading(tokenId, false));
    return;
  }

  if (auctionEndTime.lte(auctionStartTime)) {
    toastify(
      ERRORS.AUCTION_TIME_RANGE_ERROR,
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
      DISPLAY_TIME
    );
    dispatch(setListNftLoading(tokenId, false));
    return;
  }

  const hasSufficientBalance = await checkBalanceAndToast(walletAddress);
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

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, walletAddress);

  const gas = await estimateGasForListNFTApproval(
    walletAddress,
    tokenId,
    Config.MARKETPLACE_CONTRACT_ADDRESS
  );

  const requiredBalance = parseFloat(gas) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
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
      user,
      walletAddress
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

    const wallet = new ethers.Wallet(privateKey, provider);

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);
    const userBalanceNumber = parseFloat(String(userBalance));

    if (userBalanceNumber === 0) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(ERRORS.USER_BALANCE_ERROR, error);
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
      2500
    );
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
    const nftContractInstance = new ethers.Contract(
      Config.NFT_CONTRACT_ADDRESS,
      NftAbi,
      provider
    );
    const expiryTime = await nftContractInstance.getNFTExpireTime(tokenId);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    if (currentTimestamp > Number(expiryTime)) {
      toastify(
        Constants.NFT_EXPIRED,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
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
    const ideaNftContract = new ethers.Contract(
      Config.NFT_CONTRACT_ADDRESS,
      NftAbi,
      provider
    );
    const nftOwnerAddress = (
      await ideaNftContract.ownerOf(tokenId)
    ).toLowerCase();
    return nftOwnerAddress;
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
    // Get the NFT owner from the blockchain
    const ideaNftContract = new ethers.Contract(
      Config.NFT_CONTRACT_ADDRESS,
      NftAbi,
      provider
    );
    const nftOwnerAddress = (
      await ideaNftContract.ownerOf(tokenId)
    ).toLowerCase();

    // Check if user has a company/tag
    const tags = await dataProvider.getList<Tag>('tags', {
      filter: { owner: userId },
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
        const userWallet = new ethers.Wallet(userPrivateKey, provider);
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
  const ideaMarketplaceContract = new ethers.Contract(
    Config.MARKETPLACE_CONTRACT_ADDRESS,
    MarketplaceAbi,
    provider
  );

  try {
    const fixedPriceData = await ideaMarketplaceContract.fixedPrice(fixedId);
    const ownerAddress = fixedPriceData.owner.toLowerCase();
    return ownerAddress;
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
  const ideaMarketplaceContract = new ethers.Contract(
    Config.MARKETPLACE_CONTRACT_ADDRESS,
    MarketplaceAbi,
    provider
  );

  try {
    const auctionData = await ideaMarketplaceContract.auction(auctionId);
    const ownerAddress = auctionData.nftOwner.toLowerCase();
    return ownerAddress;
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
    filter: { owner: userId },
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
    filter: { owner: userId },
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
      const userWallet = new ethers.Wallet(userPrivateKey, provider);
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
    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const priceData = await ideaMarketplaceContract.fixedPrice(fixedId);

    const tokenId = Number(priceData.tokenId);
    const isExpired = await checkNftExpiry(tokenId);
    if (isExpired) {
      return;
    }

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.buyFixedPriceNft(fixedId, {
        value: priceData.nftPrice,
        from: walletAddress
      });

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
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
  context?: 'marketplace' | 'nftDetail'
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required to buy NFT');
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const priceData = await ideaMarketplaceContract.fixedPrice(fixedId);

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
        priceData.nftPrice,
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
  dispatch: any,
  userBalance?: string | number
): Promise<string> => {
  const ideaMarketplaceContract = new ethers.Contract(
    Config.MARKETPLACE_CONTRACT_ADDRESS,
    MarketplaceAbi,
    provider
  );

  // Fetch all auction data for comprehensive validation
  const auctionData = await ideaMarketplaceContract.auction(auctionId);
  const {
    initialPrice,
    currentBidAmount,
    currentBidder,
    auctionStartTime,
    auctionEndTime,
    nftOwner,
    listed,
    isSold,
    tokenId
  } = auctionData;

  // Get current block timestamp
  const currentBlock = await provider.getBlock('latest');
  const currentTimestamp = currentBlock.timestamp;

  // Get NFT expiry time
  const nftContract = new ethers.Contract(
    Config.NFT_CONTRACT_ADDRESS,
    NftAbi,
    provider
  );
  const expiryTime = await nftContract.getNFTExpireTime(tokenId);

  // Comprehensive validation checks
  const validations = {
    auctionIdValid: auctionId !== '0' && Number(auctionId) !== 0,
    auctionStarted: currentTimestamp > Number(auctionStartTime),
    auctionNotEnded: currentTimestamp < Number(auctionEndTime),
    userNotSeller: walletAddress.toLowerCase() !== nftOwner.toLowerCase(),
    nftListed: listed === true,
    nftNotSold: isSold === false,
    nftNotExpired: currentTimestamp <= Number(expiryTime),
    bidMeetsPrice: false
  };

  const normalizedBidAmount = Number(newBidAmount);
  const fixedBidAmount = normalizedBidAmount.toFixed(NUMBERS.EIGHTEEN);
  const bidValueWei = ethers.utils.parseUnits(fixedBidAmount, 'ether');

  // Check price requirements
  if (
    currentBidder === ethers.constants.AddressZero ||
    currentBidAmount.isZero()
  ) {
    validations.bidMeetsPrice = bidValueWei.gte(initialPrice);
  } else {
    validations.bidMeetsPrice = bidValueWei.gt(currentBidAmount);
  }

  // Convert both to numbers for proper comparison
  const userBalanceNum = parseFloat(String(userBalance || 0));
  const bidAmountNum = parseFloat(String(newBidAmount || 0));

  if (userBalanceNum < bidAmountNum) {
    toastify(
      `Insufficient funds: your balance is ${userBalanceNum} ETH but bid requires ${bidAmountNum} ETH in your wallet.`,
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
      DISPLAY_TIME
    );
    dispatch(setBidNftLoading(false));
    return;
  }

  const gasEstimate = await ideaMarketplaceContract.estimateGas.startBid(
    auctionId,
    {
      value: bidValueWei,
      from: walletAddress
    }
  );

  const gasFeeEther = await calculateGasFee(gasEstimate);
  return gasFeeEther;
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
  const wallet = new ethers.Wallet(privateKey, provider);
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
      throw new Error('Wallet address is required to bid on NFT');
    }

    const normalizedBidAmount = Number(newBidAmount);
    const fixedBidAmount = normalizedBidAmount.toFixed(NUMBERS.EIGHTEEN);

    dispatch(
      Actions.bidAuctionNft(
        auctionId,
        fixedBidAmount,
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
  walletAddress: string,
  fixedId: string
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const contractWithProvider = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const priceData = await contractWithProvider.fixedPrice(fixedId);

    const tokenId = Number(priceData.tokenId);
    const isExpired = await checkNftExpiry(tokenId);
    if (isExpired) {
      return;
    }

    const gasEstimate =
      await contractWithProvider.estimateGas.cancelListingForFixedPrice(
        fixedId,
        { from: walletAddress }
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.CANCEL_FIXED_GAS_ESTIMATE, error);
    throw error;
  }
};

export const cancelNftTransaction = async (
  walletAddress: string,
  fixedId: string,
  dispatch,
  filters,
  pagination,
  user
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const hasSufficientBalance = await checkBalanceAndToast(walletAddress);
    if (!hasSufficientBalance) {
      return;
    }

    const gasFee = await estimateGasForCancelNft(walletAddress, fixedId);

    const userBalance = await getBalanceByType(
      ASSET_TYPES.ETHEREUM,
      walletAddress
    );

    const requiredBalance = parseFloat(gasFee) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(setCancelNftLoading(fixedId, false));
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      return;
    }

    const contractWithProvider = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const priceData = await contractWithProvider.fixedPrice(fixedId);

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
        priceData.nftPrice,
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

export const estimateGasForCancelAuctionNft = async (
  walletAddress: string,
  listingId: string
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const contractWithProvider = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const auctionData = await contractWithProvider.auction(listingId);

    const tokenId = Number(auctionData.tokenId);
    const isExpired = await checkNftExpiry(tokenId);
    if (isExpired) {
      return;
    }

    const gasEstimate =
      await contractWithProvider.estimateGas.cancelListingForAuction(
        listingId,
        { from: walletAddress }
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.CANCEL_AUCTION_GAS_ESTIMATE, error);
    throw error;
  }
};

export const cancelNftAuctionTransaction = async (
  walletAddress: string,
  listingId: string,
  dispatch,
  nftId: string | number,
  filters,
  pagination,
  user
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const hasSufficientBalance = await checkBalanceAndToast(walletAddress);
    if (!hasSufficientBalance) {
      return;
    }

    const gasFee = await estimateGasForCancelAuctionNft(
      walletAddress,
      listingId
    );

    const userBalance = await getBalanceByType(
      ASSET_TYPES.ETHEREUM,
      walletAddress
    );

    const requiredBalance = parseFloat(gasFee) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      dispatch(setCancelNftLoading(listingId, false));
      dispatch(
        Actions.openTransakBuyModal({
          openTransakBuyModalObj: {
            open: true
          }
        })
      );
      return;
    }

    const contractWithProvider = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    const priceData = await contractWithProvider.auction(listingId);

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

export const estimateGasForClaimNftByAddress = async (
  walletAddress: string,
  auctionId: string
): Promise<string> => {
  const ideaMarketplaceContract = new ethers.Contract(
    Config.MARKETPLACE_CONTRACT_ADDRESS,
    MarketplaceAbi,
    provider
  );

  const auctionData = await ideaMarketplaceContract.auction(auctionId);

  const tokenId = Number(auctionData.tokenId);
  const isExpired = await checkNftExpiry(tokenId);
  if (isExpired) {
    return;
  }

  const gasEstimate = await ideaMarketplaceContract.estimateGas.claimNft(
    auctionId,
    {
      from: walletAddress
    }
  );

  const gasFeeEther = await calculateGasFee(gasEstimate);
  return gasFeeEther;
};

export const claimNftTransaction = async (
  privateKey: string,
  auctionId: string,
  dispatch: any,
  nftId: string | number,
  userId?: string | number
) => {
  const wallet = new ethers.Wallet(privateKey, provider);
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

export const estimateGasForTransfer = async (
  walletAddress: string,
  destinationAddress: string,
  amount: BigNumber | string | number
) => {
  try {
    let amountBN: BigNumber;
    if (BigNumber.isBigNumber(amount)) {
      amountBN = amount;
    } else {
      const decimals = await ideaCoinContract.decimals();
      if (typeof amount === 'string' || typeof amount === 'number') {
        amountBN = ethers.utils.parseUnits(amount.toString(), decimals);
      } else {
        throw new Error('Invalid amount type');
      }
    }

    const contractWithoutSigner = new ethers.Contract(
      Config.IDEACOIN_CONTRACT_ADDRESS,
      IdeaCoinABI,
      provider
    );

    const gasEstimate = await contractWithoutSigner.estimateGas.transfer(
      destinationAddress,
      amountBN,
      { from: walletAddress }
    );
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.log(ERRORS.ESTIMATE_GAS, error.message, error);
    throw error;
  }
};

export const estimateGasForTransferFrom = async (
  walletAddress: string,
  destinationAddress: string,
  amount: BigNumber | string | number
) => {
  try {
    let amountBN: BigNumber;
    if (BigNumber.isBigNumber(amount)) {
      amountBN = amount;
    } else {
      const decimals = await ideaCoinContract.decimals();
      if (typeof amount === 'string' || typeof amount === 'number') {
        amountBN = ethers.utils.parseUnits(amount.toString(), decimals);
      } else {
        throw new Error('Invalid amount type');
      }
    }

    const gasEstimate = await ideaCoinContract.estimateGas.transferFrom(
      walletAddress,
      destinationAddress,
      amountBN
    );
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.log(ERRORS.ESTIMATE_GAS, error.message, error);
    throw error;
  }
};

export const estimateGasForEthTransfer = async (
  to: string,
  amount: number,
  from?: string
): Promise<string> => {
  try {
    const weiAmount = ethers.utils.parseUnits(
      amount.toFixed(NUMBERS.EIGHTEEN),
      'ether'
    );
    const gasEstimate = await provider.estimateGas({
      to,
      value: weiAmount,
      ...(from && { from })
    });
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const estimateGasForListNFTApproval = async (
  walletAddress: string,
  tokenId: string,
  marketplaceAddress: string
) => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const ideaNftContract = new ethers.Contract(
      Config.NFT_CONTRACT_ADDRESS,
      NftAbi,
      provider
    );

    const gasEstimate = await ideaNftContract.estimateGas.approve(
      marketplaceAddress,
      tokenId,
      { from: walletAddress }
    );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
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
  const signer = new ethers.Wallet(privateKey, provider);

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

  const gasFeeEstimate = await estimateGasForNft(tokenURI);

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, signer.address);

  const requiredBalance = parseFloat(gasFeeEstimate) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
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
    return;
  }
};

export const nftApproval = async (
  walletAddress: string,
  tokenId: string,
  dispatch
) => {
  if (!walletAddress) {
    throw new Error('Wallet address is required');
  }

  const hasSufficientBalance = await checkBalanceAndToast(walletAddress);
  if (!hasSufficientBalance) {
    dispatch(setConfirmButtonLoading(false));
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

  const gasFee = await estimateGasForListNFTApproval(
    walletAddress,
    tokenId,
    Config.MARKETPLACE_CONTRACT_ADDRESS
  );

  const userBalance = await getBalanceByType(
    ASSET_TYPES.ETHEREUM,
    walletAddress
  );

  const requiredBalance = parseFloat(gasFee) * NUMBERS.BUFFER; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_LEFT,
      DISPLAY_TIME
    );
    dispatch(setConfirmButtonLoading(false));
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
      throw new CustomError('Wallet address is required', 400);
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
      gasFeeEstimate = await estimateGasForNft(tokenURI);
    } catch (gasError) {
      console.error('Gas estimation failed:', gasError);
      toastify(
        'Failed to estimate gas fees. Please check your network connection and try again.',
        VARIANT.ERROR,
        VARIANT.TOP_LEFT,
        DISPLAY_TIME
      );
      throw new CustomError(
        gasError?.message || 'Gas estimation failed. Please try again.',
        503
      );
    }

    if (userBalance < gasFeeEstimate) {
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
      return;
    }

    openTxApprovalModal(gasFeeEstimate, ASSET_TYPES.NFT, walletAddress);
  } catch (error) {
    console.error('Error in initDeployNFT:', error);
    throw error;
  }
};

export const getTransactions = async (address: string, type: string) => {
  let url = '';
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-API-Key': Config.MORALIS_API_KEY
    }
  };
  if (type === ASSET_TYPES.ETHEREUM) {
    url = `${Config.MORALIS_API_URL}/${address}?${Constants.CHAIN}=${Config.NEXT_PUBLIC_WALLET_NETWORK}`;
  } else if (type === ASSET_TYPES.IDEACOINS) {
    url = `${Config.MORALIS_API_URL}/${address}/${Constants.ERC20}/${Constants.TRANSFERS}?${Constants.CHAIN}=${Config.NEXT_PUBLIC_WALLET_NETWORK}&type=both`;
  } else if (type === ASSET_TYPES.NFT) {
    url = `${Config.MORALIS_API_URL}/${address}/${Constants.NFT_TEXT}/${Constants.TRANSFERS}?${Constants.CHAIN}=${Config.NEXT_PUBLIC_WALLET_NETWORK}`;
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${Constants.ERROR}: ${response.status}`);
  }
  return response.json();
};

export const getBalanceByType = async (type: string, address: string) => {
  try {
    if (type === ASSET_TYPES.ETHEREUM || type === ASSET_TYPES.NFT) {
      const ownerEthBalance = await provider.getBalance(address);
      return ethers.utils.formatEther(ownerEthBalance);
    } else if (type === ASSET_TYPES.IDEACOINS) {
      const ideaCoinBalance = await getIdeaCoinBalance(address);
      return truncateToFourDecimalPlaces(ideaCoinBalance);
    } else {
      throw new Error(ERRORS.INVALID_BALANCE_TYPE);
    }
  } catch (error) {
    console.error(`${ERRORS.FETCH_BALANCE} ${type}:`, error);
  }
};

const fetchEthToUsdRate = async (): Promise<number | undefined> => {
  const url = Config.COINBASE_API_URL;
  try {
    const response = await fetch(`${url}?currency=${Constants.USD}`);
    const data = await response.json();
    const rateKey = Object.keys(data.data.rates).find(
      (key) => key.toUpperCase() === Constants.ETH_SYMBOL
    );

    if (rateKey) {
      return parseFloat(data.data.rates[rateKey]);
    } else {
      console.error(ERRORS.RATE_NOT_FOUND);
      return undefined;
    }
  } catch (error) {
    console.error(ERRORS.FETCHING_LIVE_PRICES, error.message);
    return undefined;
  }
};

export const convertEthToUsd = async (
  ethAmount: number
): Promise<number | undefined> => {
  try {
    const ethToUsdRate = await fetchEthToUsdRate();
    return ethToUsdRate !== undefined ? ethAmount / ethToUsdRate : undefined;
  } catch (error) {
    console.error(ERRORS.FETCH_ETH_TO_USD_RATE);
    return undefined;
  }
};

const fetchUsdToEthRate = async (): Promise<number | undefined> => {
  const url = Config.COINBASE_API_URL;
  try {
    const response = await fetch(`${url}?currency=${ASSET_TYPES.ETH}`);
    const data = await response.json();
    const rate = data.data.rates[Constants.USD];

    if (rate) {
      return parseFloat(rate);
    } else {
      return undefined;
    }
  } catch (error) {
    console.error(ERRORS.FETCHING_LIVE_PRICES, error.message);
    return undefined;
  }
};

export const convertUsdToEth = async (
  usdAmount: number
): Promise<number | undefined> => {
  try {
    const usdToEthRate = await fetchUsdToEthRate();
    if (usdToEthRate !== undefined) {
      const res = usdAmount / usdToEthRate;
      return parseFloat(res.toFixed(18));
    } else {
      console.error(ERRORS.FETCH_ETH_TO_USD_RATE);
      return undefined;
    }
  } catch (error) {
    console.error(error.message);
    return undefined;
  }
};

export const getMinimumBidAmount = async (
  auctionId: string
): Promise<number | undefined> => {
  try {
    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      provider
    );

    // Fetch auction data using existing public mapping getter
    const auctionData = await ideaMarketplaceContract.auction(auctionId);

    const {
      currentBidAmount,
      currentBidder,
      initialPrice
    }: {
      currentBidAmount: BigNumber;
      currentBidder: string;
      initialPrice: BigNumber;
    } = auctionData;

    // If no bids exist (currentBidder is zero address), minimum is initial price
    // If bids exist, minimum is current bid amount
    let minBidWei: BigNumber;
    if (
      currentBidder === ethers.constants.AddressZero ||
      currentBidAmount.isZero()
    ) {
      minBidWei = initialPrice;
    } else {
      minBidWei = currentBidAmount;
    }

    const minBidEth = parseFloat(ethers.utils.formatEther(minBidWei));
    return minBidEth;
  } catch (error) {
    console.error('Error fetching minimum bid amount:', error);
    return undefined;
  }
};

export const formatTokenAmount = (
  value: string | number | null | undefined
): string => {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);

  let fixed = num.toFixed(18);

  fixed = fixed.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '.00');

  return fixed;
};

export const getOwnerEthBalance = async () => {
  const ownerEthBalance = await provider.getBalance(wallet.address);
  return ethers.utils.formatEther(ownerEthBalance);
};

export const showUserIdeaBalance = async (address: string): Promise<number> => {
  try {
    const ideaCoinBalance = await getIdeaCoinBalance(address);
    const formattedBalance = truncateToFourDecimalPlaces(ideaCoinBalance);
    return formattedBalance;
  } catch (error) {
    console.error(ERRORS.GET_IDEA_COINS, error);
  }
};

const truncateToFourDecimalPlaces = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.floor(value * 10000) / 10000;
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

const fetchLivePrices = async (): Promise<{ [key: string]: number }> => {
  const url = Config.COINBASE_API_URL;

  try {
    const response = await fetch(`${url}?currency=${Config.CURRENCY}`);
    const data = await response.json();
    const rates: Rates = data.data.rates;

    const results: { [key: string]: number } = {};
    CURRENCIES.forEach((currency) => {
      if (rates[currency]) {
        results[currency] = parseFloat(rates[currency]);
      }
    });

    return results;
  } catch (error) {
    console.error(ERRORS.FETCHING_LIVE_PRICES, error.message);
  }
};

const formatBalance = (balance: ethers.BigNumber): number => {
  return parseFloat(ethers.utils.formatUnits(balance, 18));
};

export const convertIdeaCoinsToMatic = async (
  ideaBalance: number,
  rewardPoolThreshold: number
): Promise<number> => {
  try {
    const totalRewardsDistributed = formatBalance(
      await ideaCoinContract.totalRewardsDistributed()
    );
    return parseFloat(
      ((ideaBalance * rewardPoolThreshold) / totalRewardsDistributed).toFixed(
        12
      )
    );
  } catch (error) {
    console.error(ERRORS.IDEA_COINS_TO_MATIC, error);
  }
};

const convertMaticToCurrency = async (maticAmount: number) => {
  try {
    const prices = await fetchLivePrices();
    const conversions = [];

    for (const key in prices) {
      conversions.push({
        currency: key,
        amount: maticAmount * prices[key]
      });
    }

    return conversions;
  } catch (error) {
    console.error(ERRORS.FAILED_TO_CONVERT_MATIC, error);
  }
};

export const getIdeaCoinBalance = async (address: string): Promise<number> => {
  try {
    const balance = await ideaCoinContract.balanceOf(address);
    return formatBalance(balance);
  } catch (error) {
    console.error(ERRORS.ERROR_FETCHING_IDEACOIN_BALANCE, address, error);
  }
};

const fetchCurrencyData = async (
  address: string,
  rewardPoolThreshold: number
) => {
  const defaultConversions = CURRENCIES.map((currency) => {
    return {
      currency,
      amount: 0
    };
  });

  try {
    let maticAmount: number;
    if (address === wallet.address) {
      const ownerEthBalance = await provider.getBalance(wallet.address);
      maticAmount = parseFloat(ethers.utils.formatEther(ownerEthBalance));
    } else {
      const ideaBalance = await getIdeaCoinBalance(address);
      maticAmount = await convertIdeaCoinsToMatic(
        ideaBalance,
        rewardPoolThreshold
      );
    }

    const conversions =
      maticAmount > 0
        ? await convertMaticToCurrency(maticAmount)
        : defaultConversions;

    return { maticAmount, conversions };
  } catch (error) {
    console.error(ERRORS.FETCHING_CURRENCY_DATA, error);
    return {
      maticAmount: 0,
      conversions: defaultConversions
    };
  }
};

export const userCurrencyData = async (walletAddress, rewardPoolThreshold) => {
  return fetchCurrencyData(walletAddress, rewardPoolThreshold);
};

export const ownerCurrencyData = async (rewardPoolThreshold) => {
  return fetchCurrencyData(wallet.address, rewardPoolThreshold);
};

export const getOriginalCreator = async (tokenId: string) => {
  const originalCreator = await nftContract.getRoyaltyReciever(tokenId);
  return originalCreator;
};

export const getOriginalCreatorRoyalty = async (tokenId: string) => {
  const data = await marketplaceContract.fixedPrice(tokenId);
  return data.royaltyFeePercentage;
};

export const getCurrentBidAmount = async (tokenId: string) => {
  const data = await marketplaceContract.auction(tokenId);
  return data.currentBidAmount;
};

export const getNftAuctionExpireTime = async (tokenId: string) => {
  const data = await marketplaceContract.auction(tokenId);
  return data.auctionEndTime;
};

