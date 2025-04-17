import { Dispatch } from 'react';
import { checkBalanceAndToast } from 'components/NftCard/utils';
import Config from 'config/config';
import IdeaCoinABI from 'contract/IdeaCoins.json';
import MarketplaceAbi from 'contract/IdeaMarketplace.json';
import NftAbi from 'contract/IdeaNft.json';
import { BigNumber, ethers } from 'ethers';
import { toastify } from 'pages/newContests/toastify';
import { nftDetailActions } from 'pages/nftListForSale/NftDetailsSection/nftDetailState/actions';
import { NftDetailAction } from 'pages/nftListForSale/NftDetailsSection/nftDetailState/interfaces';
import {
  ASSET_TYPES,
  Constants,
  CURRENCIES,
  ERRORS,
  VARIANT
} from 'utilities/constants';
import { CustomError } from './CustomError';

const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);
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
  blockExplorerUrl: Config.SEPOLIA_BASE_URL,
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
    const gasPrice = await provider.getGasPrice();
    const gasFee = gasEstimate.mul(gasPrice);
    return ethers.utils.formatUnits(gasFee, Constants.ETHER);
  } catch (error) {
    console.log(ERRORS.GAS_FEE, error);
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
  walletAddress: string,
  amount: BigNumber
) => {
  try {
    const gasEstimate = await ideaCoinContract.estimateGas.approve(
      walletAddress,
      amount
    );
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const estimateGasForListNft = async (
  privateKey: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber
) => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.listNftForFixedPrice(
        tokenId,
        listPrice,
        nftContract
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATING_LIST_NFT, error);
    throw error;
  }
};

export const listNftTransaction = async (
  privateKey: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber
) => {
  const signer = new ethers.Wallet(privateKey, provider);

  const ideaMarketplaceContract = new ethers.Contract(
    Config.MARKETPLACE_CONTRACT_ADDRESS,
    MarketplaceAbi,
    signer
  );

  const hasSufficientBalance = await checkBalanceAndToast(privateKey);
  if (!hasSufficientBalance) {
    return;
  }

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, signer.address);

  const gas = await estimateGasForListNFTApproval(
    privateKey,
    tokenId,
    Config.MARKETPLACE_CONTRACT_ADDRESS
  );

  const requiredBalance = parseFloat(gas) * 1.2; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_RIGHT,
      DISPLAY_TIME
    );
    return;
  }

  const listNftTxn = await ideaMarketplaceContract.listNftForFixedPrice(
    tokenId,
    listPrice,
    nftContract
  );

  const res = await listNftTxn.wait();
  return res;
};

export const estimateGasForListAuctionNft = async (
  privateKey: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber,
  auctionStartTime: BigNumber,
  auctionEndTime: BigNumber
) => {
  try {
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

export const listNftAuctionTransaction = async (
  privateKey: string,
  tokenId: string,
  nftContract: string,
  listPrice: BigNumber,
  auctionStartTime: BigNumber,
  auctionEndTime: BigNumber
) => {
  const signer = new ethers.Wallet(privateKey, provider);

  const ideaMarketplaceContract = new ethers.Contract(
    Config.MARKETPLACE_CONTRACT_ADDRESS,
    MarketplaceAbi,
    signer
  );

  const hasSufficientBalance = await checkBalanceAndToast(privateKey);
  if (!hasSufficientBalance) {
    return;
  }

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, signer.address);

  const gas = await estimateGasForListNFTApproval(
    privateKey,
    tokenId,
    Config.MARKETPLACE_CONTRACT_ADDRESS
  );

  const requiredBalance = parseFloat(gas) * 1.2; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_RIGHT,
      DISPLAY_TIME
    );
    return;
  }

  const listNftAuctionTxn = await ideaMarketplaceContract.listItemForAuction(
    listPrice,
    auctionStartTime,
    auctionEndTime,
    tokenId,
    nftContract
  );

  const res = await listNftAuctionTxn.wait();
  return res;
};

export const checkUserBalance = async (
  privateKey: string
): Promise<boolean> => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);
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
      VARIANT.TOP_RIGHT,
      2500
    );
    return false;
  }
};

export const estimateGasForBuyNft = async (
  privateKey: string,
  fixedId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const priceData = await ideaMarketplaceContract.fixedPrice(fixedId);

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.buyFixedPriceNft(fixedId, {
        value: ethers.utils.formatUnits(priceData.nftPrice, 'wei')
      });

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error('Error in estimateGasForBuyNft:', error);
    throw error;
  }
};

export const buyNftTransaction = async (
  privateKey: string,
  fixedId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const hasSufficientBalance = await checkBalanceAndToast(privateKey);
    if (!hasSufficientBalance) {
      return;
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasFee = await estimateGasForBuyNft(privateKey, fixedId);

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);

    const requiredBalance = parseFloat(gasFee) * 1.2; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      return;
    }

    const priceData = await ideaMarketplaceContract.fixedPrice(fixedId);

    const buyerBalance = await wallet.getBalance();

    if (buyerBalance.lt(priceData.nftPrice)) {
      throw new Error('Insufficient funds to buy the NFT');
    }

    const tx = await ideaMarketplaceContract.buyFixedPriceNft(fixedId, {
      value: priceData.nftPrice
    });

    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error('Error in buyNft:', error);
    throw error;
  }
};

export const estimateGasForBidNft = async (
  privateKey: string,
  auctionId: string,
  newBidAmount: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate = await ideaMarketplaceContract.estimateGas.startBid(
      auctionId,
      {
        value: ethers.utils.parseUnits(newBidAmount, 'ether')
      }
    );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error('Error in estimateGasForBidNft:', error);
    throw error;
  }
};

export const bidNftTransaction = async (
  privateKey: string,
  auctionId: string,
  newBidAmount: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const hasSufficientBalance = await checkBalanceAndToast(privateKey);
    if (!hasSufficientBalance) {
      return;
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasFee = await estimateGasForBidNft(
      privateKey,
      auctionId,
      newBidAmount
    );

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);

    const requiredBalance = parseFloat(gasFee) * 1.2; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      return;
    }

    const buyerBalance = await wallet.getBalance();

    if (buyerBalance.lt(ethers.utils.parseUnits(newBidAmount, 'ether'))) {
      throw new Error('Insufficient funds to bid on that NFT');
    }

    const tx = await ideaMarketplaceContract.startBid(auctionId, {
      value: ethers.utils.parseUnits(newBidAmount, 'ether')
    });

    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error('Error in bid NFT transaction:', error);
    throw error;
  }
};

export const estimateGasForCancelNft = async (
  privateKey: string,
  fixedId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.cancelListingForFixedPrice(
        fixedId
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.CANCEL_FIXED_GAS_ESTIMATE, error);
    throw error;
  }
};

export const cancelNftTransaction = async (
  privateKey: string,
  fixedId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const hasSufficientBalance = await checkBalanceAndToast(privateKey);
    if (!hasSufficientBalance) {
      return;
    }

    const gasFee = await estimateGasForCancelNft(privateKey, fixedId);

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);

    const requiredBalance = parseFloat(gasFee) * 1.2; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      return;
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const tx =
      await ideaMarketplaceContract.cancelListingForFixedPrice(fixedId);

    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(ERRORS.CANCEL_FIXED_TRANSACTION, error);
    throw error;
  }
};

export const estimateGasForCancelAuctionNft = async (
  privateKey: string,
  listingId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.cancelListingForAuction(
        listingId
      );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.CANCEL_AUCTION_GAS_ESTIMATE, error);
    throw error;
  }
};

export const cancelNftAuctionTransaction = async (
  privateKey: string,
  listingId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const hasSufficientBalance = await checkBalanceAndToast(privateKey);
    if (!hasSufficientBalance) {
      return;
    }

    const gasFee = await estimateGasForCancelAuctionNft(privateKey, listingId);

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);

    const requiredBalance = parseFloat(gasFee) * 1.2; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      return;
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const tx = await ideaMarketplaceContract.cancelListingForAuction(listingId);

    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(ERRORS.CANCEL_AUCTIION_TRANSACTION, error);
    throw error;
  }
};

export const estimateGasForAuctionEnd = async (
  privateKey: string,
  auctionId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.auctionEnd(auctionId);

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.AUCTION_END_GAS_ESTIMATE, error);
    throw error;
  }
};

export const auctionEndTransaction = async (
  privateKey: string,
  auctionId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const hasSufficientBalance = await checkBalanceAndToast(privateKey);
    if (!hasSufficientBalance) {
      return;
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasFee = await estimateGasForAuctionEnd(privateKey, auctionId);

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);

    const requiredBalance = parseFloat(gasFee) * 1.2; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      return;
    }

    const tx = await ideaMarketplaceContract.auctionEnd(auctionId);

    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(ERRORS.AUCTION_END_TRANSACTION, error);
    throw error;
  }
};

export const estimateGasForClaimNft = async (
  privateKey: string,
  auctionId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate =
      await ideaMarketplaceContract.estimateGas.claimNft(auctionId);

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.CLAIM_NFT_GAS_ESTIMATE, error);
    throw error;
  }
};

export const claimNftTransaction = async (
  privateKey: string,
  auctionId: string
) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const hasSufficientBalance = await checkBalanceAndToast(privateKey);
    if (!hasSufficientBalance) {
      return;
    }

    const ideaMarketplaceContract = new ethers.Contract(
      Config.MARKETPLACE_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasFee = await estimateGasForClaimNft(privateKey, auctionId);

    const userBalance = await getBalanceByType(ASSET_TYPES.NFT, wallet.address);

    const requiredBalance = parseFloat(gasFee) * 1.2; // Adding some buffer to handle fluctuations

    if (parseFloat(String(userBalance)) < requiredBalance) {
      toastify(
        ERRORS.INSUFFICIENT_BALANCE,
        VARIANT.ERROR,
        VARIANT.TOP_RIGHT,
        DISPLAY_TIME
      );
      return;
    }

    const tx = await ideaMarketplaceContract.claimNft(auctionId);

    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(ERRORS.CLAIM_NFT_TRANSACTION, error);
    throw error;
  }
};

export const estimateGasForTransferFrom = async (
  walletAddress: string,
  destinationAddress: string,
  amount: BigNumber
) => {
  try {
    const gasEstimate = await ideaCoinContract.estimateGas.transferFrom(
      walletAddress,
      destinationAddress,
      amount
    );
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.log(ERRORS.ESTIMATE_GAS, error.message, error);
    throw error;
  }
};

export const estimateGasForMaticTransfer = async (
  to: string,
  amount: number
): Promise<string> => {
  try {
    const gasEstimate = await provider.estimateGas({
      to,
      value: ethers.utils.parseEther(amount.toString())
    });
    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const estimateGasForListNFTApproval = async (
  privateKey: string,
  tokenId: string,
  marketplaceAddress: string
) => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(Config.INFURA_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    const ideaNftContract = new ethers.Contract(
      Config.NFT_CONTRACT_ADDRESS,
      MarketplaceAbi,
      wallet
    );

    const gasEstimate = await ideaNftContract.estimateGas.approve(
      marketplaceAddress,
      tokenId
    );

    const gasFeeEther = await calculateGasFee(gasEstimate);
    return gasFeeEther;
  } catch (error) {
    console.error(ERRORS.ESTIMATE_GAS, error);
    throw error;
  }
};

export const deployNft = async (privateKey, tokenURI) => {
  const signer = new ethers.Wallet(privateKey, provider);
  const MyNFT = new ethers.Contract(
    Config.NFT_CONTRACT_ADDRESS,
    NftAbi,
    signer
  );

  const hasSufficientBalance = await checkBalanceAndToast(privateKey);
  if (!hasSufficientBalance) {
    return;
  }

  const gasFeeEstimate = await estimateGasForNft(tokenURI);

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, signer.address);

  const requiredBalance = parseFloat(gasFeeEstimate) * 1.2; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_RIGHT,
      DISPLAY_TIME
    );
    return;
  }

  const txn = await MyNFT.mintNFT(tokenURI);
  const res = await txn.wait();
  const event = res.events[0];

  const value = event.args[2];
  const tokenId = value.toNumber();

  return [res.transactionHash, tokenId];
};

export const nftApproval = async (
  privateKey: string,
  tokenId: string,
  localDispatch: Dispatch<NftDetailAction>
) => {
  const signer = new ethers.Wallet(privateKey, provider);

  const hasSufficientBalance = await checkBalanceAndToast(privateKey);
  if (!hasSufficientBalance) {
    localDispatch(nftDetailActions.setState({ isLoading: false }));
    return;
  }

  const gasFee = await estimateGasForListNFTApproval(
    privateKey,
    tokenId,
    Config.MARKETPLACE_CONTRACT_ADDRESS
  );

  const userBalance = await getBalanceByType(ASSET_TYPES.NFT, signer.address);

  const requiredBalance = parseFloat(gasFee) * 1.2; // Adding some buffer to handle fluctuations

  if (parseFloat(String(userBalance)) < requiredBalance) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_RIGHT,
      DISPLAY_TIME
    );
    localDispatch(nftDetailActions.setState({ isLoading: false }));
    return;
  }

  const ideaNftContract = new ethers.Contract(
    Config.NFT_CONTRACT_ADDRESS,
    MarketplaceAbi,
    signer
  );

  const approvalTx = await ideaNftContract.approve(
    Config.MARKETPLACE_CONTRACT_ADDRESS,
    tokenId
  );

  const res = await approvalTx.wait();
  return [res.transactionHash];
};

export const initDeployNFT = async (
  tokenURI,
  openTxApprovalModal,
  privateKey
) => {
  const signer = new ethers.Wallet(privateKey, provider);
  const userBalance = await getBalanceByType(ASSET_TYPES.MATIC, signer.address);
  const userBalanceNumber = parseFloat(String(userBalance));

  if (userBalanceNumber === 0) {
    throw new CustomError(ERRORS.INSUFFICIENT_BALANCE, 403);
  }

  const gasFeeEstimate = await estimateGasForNft(tokenURI);

  if (userBalance < gasFeeEstimate) {
    toastify(
      ERRORS.INSUFFICIENT_BALANCE,
      VARIANT.ERROR,
      VARIANT.TOP_RIGHT,
      DISPLAY_TIME
    );
    return;
  }

  openTxApprovalModal(gasFeeEstimate, ASSET_TYPES.NFT);
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
  if (type === ASSET_TYPES.MATIC) {
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
    if (type === ASSET_TYPES.MATIC || type === ASSET_TYPES.NFT) {
      const ownerMaticBalance = await provider.getBalance(address);
      return ethers.utils.formatEther(ownerMaticBalance);
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

const fetchMaticToUsdRate = async (): Promise<number | undefined> => {
  const url = Config.COINBASE_API_URL;
  try {
    const response = await fetch(`${url}?currency=${Constants.USD}`);
    const data = await response.json();
    const rate = data.data.rates[ASSET_TYPES.MATIC];

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

export const convertMaticToUsd = async (
  maticAmount: number
): Promise<number | undefined> => {
  try {
    const maticToUsdRate = await fetchMaticToUsdRate();
    if (maticToUsdRate !== undefined) {
      return maticAmount / maticToUsdRate;
    } else {
      console.error(ERRORS.FETCH_MATIC_TO_USD_RATE);
      return undefined;
    }
  } catch (error) {
    console.error(error.message);
    return undefined;
  }
};

const fetchUsdToMaticRate = async (): Promise<number | undefined> => {
  const url = Config.COINBASE_API_URL;
  try {
    const response = await fetch(`${url}?currency=${ASSET_TYPES.MATIC}`);
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

export const convertUsdToMatic = async (
  usdAmount: number
): Promise<number | undefined> => {
  try {
    const usdToMaticRate = await fetchUsdToMaticRate();
    if (usdToMaticRate !== undefined) {
      return usdAmount / usdToMaticRate;
    } else {
      console.error(ERRORS.FETCH_MATIC_TO_USD_RATE);
      return undefined;
    }
  } catch (error) {
    console.error(error.message);
    return undefined;
  }
};

export const getOwnerMaticBalance = async () => {
  const ownerMaticBalance = await provider.getBalance(wallet.address);
  return ethers.utils.formatEther(ownerMaticBalance);
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
  const [integerPart, decimalPart] = value.toString().split('.');
  const truncatedDecimal = decimalPart ? decimalPart.slice(0, 4) : '0000';
  const truncatedValue = `${integerPart}.${truncatedDecimal}`;
  return parseFloat(truncatedValue);
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
      const ownerMaticBalance = await provider.getBalance(wallet.address);
      maticAmount = parseFloat(ethers.utils.formatEther(ownerMaticBalance));
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

