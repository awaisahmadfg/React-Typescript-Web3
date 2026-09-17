/* eslint-disable no-shadow */
/* eslint-disable no-useless-catch */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-console */
/* eslint-disable no-else-return */
/* eslint-disable max-lines */
/* eslint-disable no-await-in-loop */
/* eslint-disable prefer-const */

const mongoose = require('mongoose');
const { config } = require('dotenv');
const { ethers } = require('ethers');
const { resolve } = require('path');
const nodeCron = require('node-cron');
const { getDecryptedPrivateKey } = require('../helpers/encryptionHooks');
const royaltyCoinRewardService = require('../services/royaltyCoinRewardService');
const {
  distributeIdeaRewards,
} = require('../services/ideaRewardDistributionService');
const { getPk } = require('../helpers/utils');
const { RewardIteration } = require('../models/RewardIteration');
const {
  CHAIN_IDS,
  ERRORS,
  EVENTS,
  CREDIT_ACTIONS,
  GENERATION_TYPES,
  HTTP_STATUS,
  MODALS,
  NFT_EVENTS,
  COMMON,
  CHANNELS,
  TYPES,
  ROYALTY_COIN_ACTIONS,
  PAY_STATUS,
  QUOTATION_STATUS,
  STAKED_APPLICATION_STATUS,
  COMMUNITY_MEMBER,
  RC_SWAP,
} = require('../consts/index');

const { DEFAULT_SLIPPAGE_BPS } = RC_SWAP;
const {
  QUEUE_NFT_EMAILS,
  queueDb,
  SEND_CLAIM_YOUR_REWARD_EMAIL,
  QUEUE_REWARD_DISTRIBUTE,
} = require('../helpers/queueDb');
const pusher = require('../pusherConfig');
const { NFT } = require('../models/NFT');
const { NftActivity } = require('../models/nftActivity');
const { Quotation } = require('../models/Quotation');
const { subtractCredits } = require('../helpers/credits');
const { ObjectId } = require('mongodb');
const { completeCampaign } = require('../helpers/rewardDistribution');
const PatentMarketplaceAbi = require('../contract/PatentMarketplace.json');
const {
  ideaCoinContract,
  provider,
  wallet,
  usdtContract,
  usdtContractAddress,
  updateUser,
  getIdeaCoinPriceUsd,
  isEthPaymentToken,
  resolvePaymentTokenAddress,
  formatListingPrice,
  parseRequestBigNumber,
  ensureUsdtAllowance,
  getRoyaltyCoinOnChainBalance,
  DEFAULT_USDT_DECIMALS,
  TOKEN_DECIMALS,
} = require('../helpers/blockchain');
const { decryptPrivateKey } = require('../helpers/encryption');
const { handleNewNotification } = require('../helpers/notification');
const { getRoyaltyCoinSwapQuote } = require('../helpers/royaltyCoinSwap');
const {
  getRoyaltyCoinSwapGasEstimate,
  approveRoyaltyCoinForSwap,
  executeRoyaltyCoinSwap,
} = require('../helpers/rcSwapExecution');
const { normalizeSlippageBps } = require('../helpers/rcSwapAmount');

// Load environment variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = resolve(__dirname, `../../env/.env.${NODE_ENV}`);
config({ path: envPath });

// Initialize Ethereum provider, wallet, and contract
const { MARKETPLACE_CONTRACT_ADDRESS: marketplaceContractAddress } =
  process.env;

/**
 * Broadcasts a refresh flag on the shared NFT updates channel so that
 * any viewer of an NFT marketplace page refetches the latest NFT state.
 */
function triggerNftUpdated() {
  pusher
    .trigger(CHANNELS.NFT_UPDATES, EVENTS.NFT_UPDATED, { refresh: true })
    .catch((error) =>
      console.error('[triggerNftUpdated] Pusher trigger failed:', error),
    );
}

async function getOwnerProfileIdForWallet(defaultProfileId) {
  try {
    const TagModel = mongoose.model(MODALS.TAG);

    const company = await TagModel.findOne({
      $or: [
        { owner: defaultProfileId },
        {
          $and: [
            { 'members.profile': defaultProfileId },
            {
              'members.role': {
                $in: [COMMUNITY_MEMBER.EMPLOYEE, COMMUNITY_MEMBER.LEADER],
              },
            },
          ],
        },
      ],
    })
      .select('_id owner')
      .lean();

    const profile = await mongoose
      .model(MODALS.PROFILE)
      .findById(defaultProfileId)
      .select('employer')
      .lean();

    const isEmployeeCase = Boolean(profile?.employer);

    if (isEmployeeCase || (!isEmployeeCase && company)) {
      return company?.owner;
    } else {
      return profile?.id ?? profile?._id;
    }
  } catch (error) {
    console.error(
      '[getOwnerProfileIdForWallet] Failed to resolve owner profile:',
      {
        error: error?.message || error,
      },
    );
  }
}

async function resolveNftSellerProfile(nft) {
  if (nft?.owner) {
    //owner if the nft belongs to the regular user
    return nft.owner;
  }
  if (nft?.company) {
    //company if the nft belongs to the company
    const companyTag = await mongoose
      .model(MODALS.TAG)
      .findById(nft.company)
      .select('owner')
      .lean();
    return companyTag?.owner ?? null;
  }
  return null;
}

/**
 * Sends all purchase-related notifications for an NFT sale.
 * Private to this module — used by both the fixed-price buy flow
 * and the auction settlement flow.
 */
async function sendNftPurchaseNotifications({
  buyerProfileId,
  sellerProfileId,
  companyOwnerId,
  isCompanyPurchase,
  itemId,
  amount,
  logPrefix,
}) {
  // 1) Notify the seller that their patent token was purchased
  try {
    if (sellerProfileId && String(sellerProfileId) !== String(buyerProfileId)) {
      await handleNewNotification(
        COMMON.CREATE,
        {
          ownerId: buyerProfileId,
          userId: sellerProfileId,
          itemType: COMMON.NFT,
          actions: [COMMON.PURCHASE_PATENT],
          itemId,
        },
        {
          type: COMMON.AMOUNT_TYPE,
          amount,
        },
      );
    }
  } catch (notificationError) {
    console.error(
      `${logPrefix} Error sending seller notification:`,
      notificationError.message,
    );
  }

  // 2) Notify the buyer of their purchase
  try {
    await handleNewNotification(
      COMMON.CREATE,
      {
        ownerId: buyerProfileId,
        userId: buyerProfileId,
        itemType: COMMON.NFT,
        actions: [COMMON.NFT_PURCHASED],
        itemId,
      },
      {
        type: COMMON.AMOUNT_TYPE,
        amount,
      },
    );
  } catch (notificationError) {
    console.error(
      `${logPrefix} Error sending buyer purchase notification:`,
      notificationError.message,
    );
  }

  // 3) Royalty coin reward notification only for personal purchases —
  // company purchases track the reward as pending for the company tag
  if (!isCompanyPurchase) {
    try {
      await handleNewNotification(COMMON.CREATE, {
        ownerId: buyerProfileId,
        userId: buyerProfileId,
        itemType: COMMON.NFT,
        actions: [COMMON.NFT_ROYALTY_REWARD],
        itemId,
        ideaCoins: 2,
      });
    } catch (notificationError) {
      console.error(
        `${logPrefix} Error sending royalty reward notification:`,
        notificationError.message,
      );
    }
  }

  // 4) Company purchase by a member (leader/employee) — notify the company owner
  if (
    isCompanyPurchase &&
    companyOwnerId &&
    String(companyOwnerId) !== String(buyerProfileId)
  ) {
    try {
      await handleNewNotification(
        COMMON.CREATE,
        {
          ownerId: buyerProfileId,
          userId: companyOwnerId,
          itemType: COMMON.NFT,
          actions: [COMMON.NFT_PURCHASED_BY_COMPANY],
          itemId,
        },
        {
          type: COMMON.AMOUNT_TYPE,
          amount,
        },
      );
    } catch (notificationError) {
      console.error(
        `${logPrefix} Error sending company owner notification:`,
        notificationError.message,
      );
    }
  }
}

/**
 * When the buyer is owner or employee of a company (Tag),
 * returns that Tag's _id so the invention can also show
 * in the community Inventions tab.
 */
async function isCommunityEmployee(profileId) {
  if (!profileId) return null;
  try {
    const TagModel = mongoose.model(MODALS.TAG);
    const tag = await TagModel.findOne({
      $or: [
        { owner: profileId },
        {
          $and: [
            { 'members.profile': profileId },
            {
              'members.role': {
                $in: [COMMUNITY_MEMBER.EMPLOYEE, COMMUNITY_MEMBER.LEADER],
              },
            },
          ],
        },
      ],
    })
      .select('_id owner')
      .lean();

    const profile = await mongoose
      .model(MODALS.PROFILE)
      .findById(profileId)
      .select('employer')
      .lean();

    const isEmployeeCase = Boolean(profile?.employer);

    if (isEmployeeCase || (!isEmployeeCase && tag)) {
      return tag?._id ?? tag?.id;
    }

    return null;
  } catch (error) {
    console.error(
      '[isCommunityEmployee] Failed to resolve tag for profile:',
      error?.message || error,
    );
    return null;
  }
}

async function finalizeAuctionSettlement({
  auctionData,
  ownerProfileId,
  walletAddressForRewards,
  eventType,
  txFrom,
  txTo,
  txHash,
}) {
  const tokenId = Number(auctionData.tokenId.toString());
  const nft = await NFT.findOne({ tokenId: tokenId.toString() });

  if (!nft) {
    throw new Error(ERRORS.NFT_NOT_FOUND);
  }

  const tagId = await isCommunityEmployee(ownerProfileId);
  const owner = tagId ? null : ownerProfileId;
  const companyIdForNft = tagId ? tagId : null;

  const updatedData = {
    isListed: false,
    onAuction: false,
    maticPrice: null,
    usdPrice: null,
    owner,
    company: companyIdForNft,
    expiryDate: null,
    auctionStartTime: null,
    event: eventType,
  };

  console.log('updatedData', updatedData);

  await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

  const activityData = {
    nft: nft._id,
    from: txFrom,
    to: txTo,
    event: eventType,
    price: null,
    txHash,
  };

  await NftActivity.create(activityData);

  // ********************** Notifications **************************
  let priceInMatic = null;
  try {
    priceInMatic = ethers.utils.formatUnits(
      auctionData.currentBidAmount.toString(),
      18,
    );
  } catch (priceError) {
    console.error(
      '[finalizeAuctionSettlement] Error formatting bid amount:',
      priceError.message,
    );
  }

  const buyerProfileId = ownerProfileId;
  const sellerProfileId = await resolveNftSellerProfile(nft);
  const companyWalletTag = walletAddressForRewards
    ? await mongoose
        .model(MODALS.TAG)
        .findOne({ walletAddress: walletAddressForRewards })
        .select('_id owner')
        .lean()
    : null;
  const isCompanyPurchase = Boolean(companyWalletTag?._id);
  const companyOwnerId = isCompanyPurchase ? companyWalletTag?.owner : null;

  await sendNftPurchaseNotifications({
    buyerProfileId,
    sellerProfileId,
    companyOwnerId,
    isCompanyPurchase,
    itemId: nft._id,
    amount: priceInMatic,
    logPrefix: '[finalizeAuctionSettlement]',
  });

  const bidCount = await mongoose
    .model(MODALS.BID)
    .countDocuments({ tokenId: nft._id });
  if (bidCount >= 1) {
    await mongoose.model(MODALS.BID).deleteMany({ tokenId: nft._id });
  }

  if (nft.invention) {
    const Application = mongoose.model(MODALS.APPLICATION);
    const inventionDoc = await Application.findOne({ _id: nft.invention });
    if (inventionDoc) {
      if (!inventionDoc.createdBy) {
        inventionDoc.createdBy = inventionDoc.owner;
      }
      if (tagId) {
        inventionDoc.company = tagId;
        inventionDoc.owner = null;
      } else {
        inventionDoc.company = null;
        inventionDoc.owner = ownerProfileId;
      }
      await inventionDoc.save();
    }
  }

  let rewardWalletAddress = walletAddressForRewards;

  if (tagId) {
    const company = await mongoose
      .model(MODALS.TAG)
      .findById(tagId)
      .select('walletAddress')
      .lean();
    if (company?.walletAddress) {
      rewardWalletAddress = company.walletAddress;
    }
  }

  queueDb.addToQueue(QUEUE_REWARD_DISTRIBUTE, {
    type: 'idea_reward',
    walletAddress: rewardWalletAddress,
    amount: 2,
    rewardedEntity: isCompanyPurchase
      ? companyWalletTag._id
      : getPk(ownerProfileId),
    rewardedEntityType: isCompanyPurchase ? MODALS.TAG : MODALS.PROFILE,
    sourceEntity: nft._id,
    sourceEntityType: MODALS.NFT,
    action: ROYALTY_COIN_ACTIONS.NFT_TRANSFER,
  });

  if (isCompanyPurchase) {
    await royaltyCoinRewardService.trackDistributedReward({
      rewardedEntity: companyWalletTag._id,
      amount: 2,
      sourceEntity: nft._id,
      sourceEntityType: MODALS.NFT,
      rewardedEntityType: MODALS.TAG,
      action: ROYALTY_COIN_ACTIONS.NFT_TRANSFER,
    });
  } else {
    await royaltyCoinRewardService.trackDistributedReward({
      rewardedEntity: getPk(ownerProfileId),
      amount: 2,
      sourceEntity: nft._id,
      sourceEntityType: MODALS.NFT,
      rewardedEntityType: MODALS.PROFILE,
      action: ROYALTY_COIN_ACTIONS.NFT_TRANSFER,
    });
  }
}

async function _getEligibleAddresses() {
  const users = await mongoose.model(MODALS.PROFILE).find({
    walletAddress: {
      $ne: '',
      $exists: true,
      $type: 'string',
    },
  });

  let eligibleUsers = [];

  for (let user of users) {
    try {
      user = user.toObject();
      const ideaCoins = await ideaCoinContract.balanceOf(user.walletAddress);
      if (ideaCoins.gt(0)) {
        eligibleUsers.push({
          ...user,
          ideaCoins,
        });
      }
    } catch (e) {
      console.error(ERRORS.GET_ELIGIBLE_USERS, e.message);
    }
  }
  return eligibleUsers;
}

async function insertRewardIteration(threshold) {
  try {
    const newRewardIteration = new RewardIteration({
      threshold,
    });
    const result = await newRewardIteration.save();
    console.log('RewardIteration entry created successfully:', result);
  } catch (error) {
    console.error('Error creating RewardIteration entry:', error);
  }
}

async function getLatestRewardIteration() {
  try {
    return await RewardIteration.findOne().sort({ createdAt: -1 });
  } catch (error) {
    console.error(ERRORS.GET_REWARD_ITERATION, error);
  }
}

const formatBalance = (balance) => {
  return parseFloat(ethers.utils.formatUnits(balance, 18));
};

async function sendEmailViaQueue(user, share) {
  queueDb.addToQueue(SEND_CLAIM_YOUR_REWARD_EMAIL, { user, share });
  // queueDb.createWorker(SEND_CLAIM_YOUR_REWARD_EMAIL, async (item) => {
  //   const { user, share } = item.data;
  //   await sendClaimYourRewardEmail(user, share);
  // });
}

async function getPrivateKeyForWalletAddress(userId, targetWalletAddress) {
  const adminWalletAddress = wallet?.address?.toLowerCase();
  const targetAddress = targetWalletAddress?.toLowerCase();

  if (
    adminWalletAddress &&
    targetAddress &&
    adminWalletAddress === targetAddress
  ) {
    return process.env.PRIVATE_KEY;
  }

  const Tag = mongoose.model(MODALS.TAG);
  const company = await Tag.findOne({
    $or: [
      { owner: userId },
      {
        $and: [
          { 'members.profile': userId },
          {
            'members.role': {
              $in: [COMMUNITY_MEMBER.EMPLOYEE, COMMUNITY_MEMBER.LEADER],
            },
          },
        ],
      },
    ],
  });

  const userProfile = await mongoose.model(MODALS.PROFILE).findById(userId);

  const isEmployeeCase = Boolean(userProfile?.employer);

  const isOwnerTagApplied = !isEmployeeCase && company;

  // Check if wallet belongs to company
  if (
    (isEmployeeCase || isOwnerTagApplied) &&
    company?.walletAddress?.toLowerCase() === targetAddress
  ) {
    return getDecryptedPrivateKey(company);
  }

  // Check if wallet belongs to user
  if (userProfile?.walletAddress?.toLowerCase() === targetAddress) {
    return getDecryptedPrivateKey(userProfile);
  }

  throw new Error(
    `Wallet address does not match user, company, or admin wallet. Admin: ${adminWalletAddress}, Target: ${targetAddress}, User: ${userProfile?.walletAddress?.toLowerCase()}`,
  );
}

async function checkNftExpiryFromContract(tokenId) {
  try {
    const ideaMarketplaceContract = new ethers.Contract(
      marketplaceContractAddress,
      PatentMarketplaceAbi,
      provider,
    );
    const expiryTime =
      await ideaMarketplaceContract.getPatentTokenExpireTime(tokenId);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return Number(expiryTime.toString()) <= currentTimestamp;
  } catch (error) {
    console.error('Error checking NFT expiry:', error);
    return false;
  }
}

/**
 * Mirrors `RoyaltyCoin.distributeRoyaltyCoinReward` for a given `amount`
 * (formatted string, 18 decimals) and returns what the user would receive
 * along with the MindMiner / liquidity fee split and any validation error.
 */
async function buildRcRewardPreview(amount) {
  const requestedAmount = String(amount ?? '').trim();

  const emptyPreview = (error) => ({
    requestedAmount,
    userReceives: '0',
    mindminerFee: '0',
    liquidityFee: '0',
    totalFromPool: '0',
    canDistribute: false,
    error,
  });

  let requestedWei;
  try {
    requestedWei = ethers.utils.parseUnits(requestedAmount, 18);
  } catch (parseError) {
    return emptyPreview('Invalid amount.');
  }

  const [
    rewardsSupply,
    totalRewardsDistributed,
    rewardsRemaining,
    mindminerFeeBps,
    liquidityFeeBps,
    maxSingleDistribution,
  ] = await Promise.all([
    ideaCoinContract.REWARDS_SUPPLY(),
    ideaCoinContract.totalRewardsDistributed(),
    ideaCoinContract.remainingSupply(),
    ideaCoinContract.MINDMINER_FEE_BPS(),
    ideaCoinContract.LIQUIDITY_FEE_BPS(),
    ideaCoinContract.MAX_SINGLE_DISTRIBUTION(),
  ]);

  const adjustedAmount = requestedWei.mul(rewardsRemaining).div(rewardsSupply);
  const mindminerPortion = adjustedAmount.mul(mindminerFeeBps).div(10000);
  const liquidityPortion = adjustedAmount.mul(liquidityFeeBps).div(10000);
  const totalFromPool = adjustedAmount
    .add(mindminerPortion)
    .add(liquidityPortion);

  let error = null;
  if (requestedWei.lte(0)) {
    error = 'Amount must be greater than zero.';
  } else if (totalRewardsDistributed.gte(rewardsSupply)) {
    error = 'All RoyaltyCoin rewards have already been distributed.';
  } else if (requestedWei.gt(maxSingleDistribution)) {
    error = 'Amount exceeds the maximum single distribution (1,000,000 RC).';
  } else if (adjustedAmount.isZero()) {
    error = 'Adjusted reward is too low after pool scaling.';
  } else if (mindminerFeeBps.gt(0) && mindminerPortion.isZero()) {
    error = 'MindMiner fee portion rounds to zero for this amount.';
  } else if (liquidityFeeBps.gt(0) && liquidityPortion.isZero()) {
    error = 'Liquidity fee portion rounds to zero for this amount.';
  } else if (totalFromPool.gt(rewardsRemaining)) {
    error = 'Total distribution exceeds remaining rewards pool.';
  } else if (totalRewardsDistributed.add(totalFromPool).gt(rewardsSupply)) {
    error = 'Total distribution would exceed the rewards pool supply.';
  }

  if (error) {
    return emptyPreview(error);
  }

  return {
    requestedAmount,
    userReceives: ethers.utils.formatUnits(adjustedAmount, 18),
    mindminerFee: ethers.utils.formatUnits(mindminerPortion, 18),
    liquidityFee: ethers.utils.formatUnits(liquidityPortion, 18),
    totalFromPool: ethers.utils.formatUnits(totalFromPool, 18),
    canDistribute: true,
    error: null,
  };
}

// Blockchain controller object
const blockchainController = {
  distributeIdeaRewards,
  getRewardsPoolThreshold: async (req, res) => {
    try {
      const latestRewardIteration = await getLatestRewardIteration();
      res.json(latestRewardIteration);
    } catch (error) {
      console.error(ERRORS.GET_REWARD_THRESHOLD, error);
      res.status(500).json({ error: ERRORS.GET_REWARD_THRESHOLD });
    }
  },

  getIdeaCoinPrice: async (req, res) => {
    try {
      const parsed = parseInt(req.query.chainId, 10);
      const allowed = [CHAIN_IDS.SEPOLIA, CHAIN_IDS.MAINNET];
      const requestedChainId =
        Number.isNaN(parsed) || !allowed.includes(parsed) ? undefined : parsed;
      const { priceUsd, priceInUsdt, chainId } =
        await getIdeaCoinPriceUsd(requestedChainId);
      return res.json({ priceUsd, chainId, priceInUsdt });
    } catch (error) {
      console.error('[getIdeaCoinPrice]', error?.message || error);
      return res.status(500).json({
        priceUsd: 0,
        error: error?.message || 'Failed to fetch IdeaCoin price',
      });
    }
  },

  getRcRewardPreview: async (req, res) => {
    try {
      const preview = await buildRcRewardPreview(req.query.amount);
      return res.json(preview);
    } catch (error) {
      console.error('[getRcRewardPreview]', error?.message || error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error?.message || 'Failed to build RC reward preview',
      });
    }
  },

  getRoyaltyCoinSwapQuote: async (req, res) => {
    try {
      const { amountRc, outputToken, chainId } = req.query;
      const parsedChainId = parseInt(chainId, 10);
      const quote = await getRoyaltyCoinSwapQuote({
        amountRc,
        outputToken,
        chainId: Number.isNaN(parsedChainId) ? undefined : parsedChainId,
      });
      return res.json({ success: true, ...quote });
    } catch (error) {
      console.error('[getRoyaltyCoinSwapQuote]', error?.message || error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error?.message || 'Failed to fetch swap quote',
      });
    }
  },

  getRoyaltyCoinSwapGasEstimate: async (req, res) => {
    try {
      const {
        amountRc,
        outputToken,
        chainId,
        walletAddress: providedWalletAddress,
        slippageBps,
      } = req.query;

      let walletAddress = providedWalletAddress || req.user?.walletAddress;
      if (!walletAddress) {
        const profile = await mongoose
          .model(MODALS.PROFILE)
          .findOne({ _id: req.user.id })
          .lean();
        walletAddress = profile?.walletAddress;
      }

      if (!walletAddress) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERRORS.WALLET_ADDRESS_NOT_FOUND,
        });
      }

      const parsedChainId = parseInt(chainId, 10);
      const estimate = await getRoyaltyCoinSwapGasEstimate({
        walletAddress,
        amountRc,
        outputToken,
        chainId: Number.isNaN(parsedChainId) ? undefined : parsedChainId,
        slippageBps: normalizeSlippageBps(slippageBps, DEFAULT_SLIPPAGE_BPS),
      });

      return res.json({ success: true, ...estimate });
    } catch (error) {
      console.error('[getRoyaltyCoinSwapGasEstimate]', error?.message || error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error?.message || 'Failed to estimate swap gas',
      });
    }
  },

  approveRoyaltyCoinForSwap: async (req, res) => {
    try {
      const {
        amountRc,
        outputToken,
        walletAddress: providedWalletAddress,
        slippageBps,
        chainId,
      } = req.body;

      let walletAddress = providedWalletAddress || req.user?.walletAddress;
      if (!walletAddress) {
        const profile = await mongoose
          .model(MODALS.PROFILE)
          .findOne({ _id: req.user.id })
          .lean();
        walletAddress = profile?.walletAddress;
      }

      if (!walletAddress) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERRORS.WALLET_ADDRESS_NOT_FOUND,
        });
      }

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);
      const parsedChainId = parseInt(chainId, 10);

      const result = await approveRoyaltyCoinForSwap({
        signer,
        amountRc,
        outputToken,
        chainId: Number.isNaN(parsedChainId) ? undefined : parsedChainId,
        slippageBps: normalizeSlippageBps(slippageBps, DEFAULT_SLIPPAGE_BPS),
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('[approveRoyaltyCoinForSwap]', error?.message || error);
      const clientError =
        error?.message &&
        (/Invalid|Insufficient|chain|liquidity|route|configured|Amount|decimal|approval/i.test(
          error.message,
        ) ||
          error.message.includes('Use USDT'));
      return res
        .status(
          clientError
            ? HTTP_STATUS.BAD_REQUEST
            : HTTP_STATUS.INTERNAL_SERVER_ERROR,
        )
        .json({
          success: false,
          message: error?.message || ERRORS.TRANSACTION_FAILED,
        });
    }
  },

  executeRoyaltyCoinSwap: async (req, res) => {
    try {
      const {
        amountRc,
        outputToken,
        walletAddress: providedWalletAddress,
        slippageBps,
        chainId,
      } = req.body;

      let walletAddress = providedWalletAddress || req.user?.walletAddress;
      if (!walletAddress) {
        const profile = await mongoose
          .model(MODALS.PROFILE)
          .findOne({ _id: req.user.id })
          .lean();
        walletAddress = profile?.walletAddress;
      }

      if (!walletAddress) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERRORS.WALLET_ADDRESS_NOT_FOUND,
        });
      }

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);
      const parsedChainId = parseInt(chainId, 10);

      const result = await executeRoyaltyCoinSwap({
        signer,
        amountRc,
        outputToken,
        chainId: Number.isNaN(parsedChainId) ? undefined : parsedChainId,
        slippageBps: normalizeSlippageBps(slippageBps, DEFAULT_SLIPPAGE_BPS),
        recipientAddress: walletAddress,
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('[executeRoyaltyCoinSwap]', error?.message || error);
      const clientError =
        error?.message &&
        (/Invalid|Insufficient|chain|liquidity|route|configured|Amount|decimal|approval/i.test(
          error.message,
        ) ||
          error.message.includes('Use USDT'));
      return res
        .status(
          clientError
            ? HTTP_STATUS.BAD_REQUEST
            : HTTP_STATUS.INTERNAL_SERVER_ERROR,
        )
        .json({
          success: false,
          message: error?.message || ERRORS.TRANSACTION_FAILED,
        });
    }
  },

  getRoyaltyCoinBalance: async (req, res) => {
    try {
      let walletAddress = req.query.walletAddress || req.user?.walletAddress;
      if (!walletAddress) {
        const profile = await mongoose
          .model(MODALS.PROFILE)
          .findOne({ _id: req.user.id })
          .lean();
        walletAddress = profile?.walletAddress;
      }

      if (!walletAddress || !ethers.utils.isAddress(walletAddress)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERRORS.WALLET_ADDRESS_NOT_FOUND,
        });
      }

      const { balance, balanceRaw } =
        await getRoyaltyCoinOnChainBalance(walletAddress);

      return res.json({
        success: true,
        walletAddress,
        balance,
        balanceRaw,
      });
    } catch (error) {
      console.error('[getRoyaltyCoinBalance]', error?.message || error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error?.message || 'Failed to fetch RoyaltyCoin balance',
      });
    }
  },

  distributeUsdtRewards: async (req, res) => {
    try {
      const { walletAddress: address, share: amount } = await mongoose
        .model(MODALS.PROFILE)
        .findOne({ _id: req.user.id });

      if (!address || !amount) {
        throw new Error(ERRORS.INVALID_PARAMETER);
      }

      if (!ethers.utils.isAddress(address)) {
        throw new Error(ERRORS.INVALID_ADDRESS);
      }

      const usdtAmount = ethers.utils.parseUnits(amount.toString(), 6);
      if (usdtAmount.lte(0)) {
        throw new Error(ERRORS.INVALID_AMOUNT);
      }

      const ideaBalance = await ideaCoinContract.balanceOf(address);
      if (ideaBalance.eq(0)) {
        throw new Error(ERRORS.IDEACOINS_INSUFFICIENT);
      }

      const ownerUsdtBalance = await usdtContract.balanceOf(wallet.address);
      if (usdtAmount.gt(ownerUsdtBalance)) {
        throw new Error(ERRORS.ETH_INSUFFICIENT);
      }

      pusher.trigger(
        `${CHANNELS.DISTRIBUTE_REWARD}-${address}`,
        EVENTS.LOADING,
        {
          type: COMMON.INFO,
          message: COMMON.REWARDS_INITIATED,
        },
      );

      pusher.trigger(
        `${CHANNELS.DISTRIBUTE_REWARD}-${address}`,
        EVENTS.LOADING,
        {
          type: COMMON.INFO,
          message: COMMON.FEW_MORE_MOMENTS,
        },
      );

      const approveTx = await usdtContract
        .connect(wallet)
        .approve(ideaCoinContract.address, usdtAmount);
      await approveTx.wait();

      const tx = await ideaCoinContract.distributeUsdtReward(
        address,
        usdtAmount,
        usdtContractAddress,
      );

      await tx.wait();

      pusher.trigger(
        `${CHANNELS.DISTRIBUTE_REWARD}-${address}`,
        EVENTS.LOADING,
        {
          type: COMMON.SUCCESS,
          message: COMMON.REWARDS_TRANSFERED,
        },
      );

      await updateUser(req.user.id, { share: 0 });

      res.json({
        success: true,
        message: COMMON.USDT_REWARD_DISTRIBUTED,
      });
    } catch (error) {
      console.error(ERRORS.TRANSACTION_FAILED, error);
      return res.status(500).json({
        success: false,
        message: `${ERRORS.TRANSACTION_FAILED}: ${error.message}`,
      });
    }
  },

  monitorUsdtBalance: async () => {
    try {
      const ownerUsdtBalance = await usdtContract.balanceOf(wallet.address);
      const ownerUsdt = parseFloat(
        ethers.utils.formatUnits(ownerUsdtBalance, 6),
      );
      console.log(`Checked owner's USDT balance: ${ownerUsdt} USDT`);

      const latestIteration = await getLatestRewardIteration();
      const threshold = latestIteration?.threshold;
      if (!latestIteration || !threshold || threshold <= 0) {
        console.log(
          'Skipping USDT reward distribution because RewardIteration threshold is missing or invalid.',
        );
        return;
      }

      if (ownerUsdt >= threshold) {
        console.log('USDT threshold met. Checking eligible addresses...');
        const eligibleUsers = await _getEligibleAddresses(); // Get Users that have IdeaCoins > 0
        console.log(
          `Eligible users (IdeaCoin > 0): ${eligibleUsers?.length ?? 0}`,
        );

        if (!eligibleUsers?.length) {
          console.log(
            'No eligible users (IdeaCoin > 0). No PENDING rewards created.',
          );
          return;
        }

        let totalRewardsDistributed =
          await ideaCoinContract.totalRewardsDistributed();
        totalRewardsDistributed = formatBalance(totalRewardsDistributed);

        if (!totalRewardsDistributed || totalRewardsDistributed <= 0) {
          console.log(
            'Skipping USDT reward distribution because totalRewardsDistributed is zero or invalid.',
          );
          return;
        }

        const userShares = eligibleUsers.map((user) => {
          const ideaBalance = parseFloat(
            ethers.utils.formatUnits(user.ideaCoins, 18),
          );
          const userShare = parseFloat(
            ((ideaBalance * threshold) / totalRewardsDistributed).toFixed(12),
          );
          sendEmailViaQueue(user, userShare);
          return { id: user._id, address: user.walletAddress, userShare };
        });

        await Promise.all(
          userShares.map(async (obj) => {
            await updateUser(obj.id, {
              $inc: { share: obj.userShare },
            });
            await mongoose.model(MODALS.REWARD_DISTRIBUTION_HISTORY).create({
              user: obj.id,
              share: obj.userShare,
              status: PAY_STATUS.PENDING,
            });
          }),
        );

        const usdtThreshold = (threshold * 125) / 100;
        await insertRewardIteration(usdtThreshold);
        console.log(`New threshold is ${usdtThreshold} USDT`);
        return;
      } else {
        console.log('USDT threshold not met. No action taken.');
      }
    } catch (error) {
      console.error(ERRORS.ETH_BALANCE_MONITORING_ERROR, error);
    }
  },

  nftApprovalTransaction: async (req, res) => {
    try {
      const { tokenId, walletAddress } = req.body;
      if (!tokenId) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      const nft = await NFT.findOne({ tokenId }).populate({
        path: 'invention',
        model: 'Application',
        select: 'owner tags',
      });
      if (nft?.onAuction) {
        const isExpired = await checkNftExpiryFromContract(tokenId);
        if (isExpired) {
          return res.status(400).json({
            success: false,
            error: 'NFT has expired. Cannot approve for listing.',
          });
        }
      }

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        process.env.MARKETPLACE_CONTRACT_ADDRESS,
        PatentMarketplaceAbi,
        signer,
      );

      const tx = await ideaMarketplaceContract.approve(
        process.env.MARKETPLACE_CONTRACT_ADDRESS,
        tokenId,
      );
      await tx.wait();

      return res.json({
        success: true,
        message: COMMON.NFT_APPROVAL_SUCCESSFUL,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.APPROVAL_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  listFixedNftTransaction: async (req, res) => {
    try {
      const { tokenId, listPrice, usdPrice, walletAddress, paymentToken } =
        req.body;
      if (!tokenId || !listPrice || !usdPrice || !walletAddress) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      const resolvedPaymentToken = resolvePaymentTokenAddress(
        paymentToken || usdtContractAddress,
      );
      if (
        !isEthPaymentToken(resolvedPaymentToken) &&
        resolvedPaymentToken.toLowerCase() !== usdtContractAddress.toLowerCase()
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment token. Only ETH or USDT are supported.',
        });
      }

      // ********************** NFT Table Update *******************
      const nft = await NFT.findOne({ tokenId }).populate({
        path: 'invention',
        populate: {
          path: 'crowdfundingCampaign',
          select: 'status',
        },
      });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const invention = nft?.invention;
      if (!invention) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const inventionId = invention._id || invention;
      const { quotationRequest, acceptedQuotation, crowdfundingCampaign } =
        invention;

      const isCampaignFulfilled =
        crowdfundingCampaign &&
        (typeof crowdfundingCampaign === 'object'
          ? crowdfundingCampaign.status
          : null) === STAKED_APPLICATION_STATUS.FULFILLED;

      if (!isCampaignFulfilled) {
        const blockingQuotations = await Quotation.find({
          invention: inventionId,
          status: {
            $in: [QUOTATION_STATUS.SENT, QUOTATION_STATUS.ACCEPTED],
          },
        });

        if (
          quotationRequest ||
          acceptedQuotation ||
          (blockingQuotations && blockingQuotations.length > 0)
        ) {
          return res.status(400).json({
            success: false,
            error: ERRORS.CANNOT_LIST_PATENT_TOKEN_QUOTATION_EXISTS,
          });
        }
      }

      if (nft?.onAuction) {
        const isExpired = await checkNftExpiryFromContract(tokenId);
        if (isExpired) {
          return res.status(400).json({
            success: false,
            error: 'NFT has expired. Cannot list for fixed price.',
          });
        }

        if (nft?.expiryDate) {
          const currentTime = new Date();
          const auctionEndTime = new Date(nft.expiryDate);
          if (auctionEndTime <= currentTime) {
            return res.status(400).json({
              success: false,
              error:
                'Auction end time has been reached. Cannot list for fixed price.',
            });
          }
        }
      }

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      const listPriceWei = parseRequestBigNumber(listPrice);
      const priceInMatic = formatListingPrice(
        listPriceWei,
        resolvedPaymentToken,
      );

      const listFixedNftTxn =
        await ideaMarketplaceContract.listPatentTokenForFixedPrice(
          tokenId,
          listPriceWei,
          marketplaceContractAddress,
          resolvedPaymentToken,
        );

      const receipt = await listFixedNftTxn.wait(2);

      const { transactionHash, from, to } = receipt;

      const updatedData = {
        isListed: true,
        maticPrice: priceInMatic,
        usdPrice: usdPrice,
        paymentToken: resolvedPaymentToken,
        event: NFT_EVENTS.LIST,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      // ********************** nftActivity Table update *******************
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.LIST,
        price: priceInMatic,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      // ********************** Subtract Credits *******************
      const creditsHistory = {
        _id: new ObjectId(),
        action: CREDIT_ACTIONS.LIST_NFT,
      };

      await subtractCredits(
        req.user.id,
        10,
        creditsHistory,
        null,
        GENERATION_TYPES.NFT_TRANSACTION,
        false,
      );

      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.NFT_FIXED_LIST_SUCCESS,
        transactionHash: transactionHash,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.LIST_FIXED_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  cancelFixedTransaction: async (req, res) => {
    try {
      const { tokenId, priceOfNft } = req.body;
      if (!tokenId || !priceOfNft) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      // ********************** NFT Table Update *******************
      const nft = await NFT.findOne({ tokenId });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const updatedData = {
        isListed: false,
        maticPrice: null,
        usdPrice: null,
        onAuction: false,
        expiryDate: null,
        auctionStartTime: null,
        event: NFT_EVENTS.CANCEL,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      // Get listing owner from the contract (not on-chain NFT owner, as NFT is in marketplace)
      const ideaMarketplaceContractRead = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        provider,
      );
      const fixedPriceData =
        await ideaMarketplaceContractRead.fixedPrice(tokenId);
      const listingOwnerAddress = fixedPriceData.owner.toLowerCase();

      const ownerPrivateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        listingOwnerAddress,
      );
      const signer = new ethers.Wallet(ownerPrivateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      const cancelFixedNftTxn =
        await ideaMarketplaceContract.cancelListingForFixedPrice(tokenId);

      const receipt = await cancelFixedNftTxn.wait();

      const { transactionHash, from, to } = receipt;

      // ********************** nftActivity Table update *******************
      const priceInMatic = ethers.utils.formatUnits(priceOfNft, 18);
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.CANCEL,
        price: priceInMatic,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.NFT_FIXED_CANCEL_SUCCESS,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.CANCEL_FIXED_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  buyFixedTransaction: async (req, res) => {
    try {
      const { tokenId, priceOfNft, walletAddress } = req.body;
      if (!tokenId || !priceOfNft) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      let encryptedPrivateKey;

      const isProfileWallet = await mongoose
        .model(MODALS.PROFILE)
        .findOne({ walletAddress })
        .lean();

      if (isProfileWallet) {
        encryptedPrivateKey = isProfileWallet?.privateKey;
      }

      const isCompanyWallet = await mongoose
        .model(MODALS.TAG)
        .findOne({ walletAddress })
        .lean();

      if (isCompanyWallet) {
        encryptedPrivateKey = isCompanyWallet?.privateKey;
      }

      const privateKey = decryptPrivateKey(encryptedPrivateKey);

      const signer = new ethers.Wallet(privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      let ownerProfileId = req.user.id || req.user._id;

      // ********************** NFT Table Update *******************
      const nft = await NFT.findOne({ tokenId });
      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const owner =
        (isCompanyWallet?.id ?? isCompanyWallet?._id) ? null : ownerProfileId;
      const companyIdForNft =
        (isCompanyWallet?.id ?? isCompanyWallet?._id)
          ? (isCompanyWallet?.id ?? isCompanyWallet?._id)
          : null;

      const updatedData = {
        owner,
        company: companyIdForNft,
        isListed: false,
        onAuction: false,
        maticPrice: null,
        usdPrice: null,
        paymentToken: null,
        expiryDate: null,
        auctionStartTime: null,
        event: NFT_EVENTS.BUY,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      // ********************** Application (invention) ownership **************************
      if (nft.invention) {
        const Application = mongoose.model(MODALS.APPLICATION);
        const inventionDoc = await Application.findOne({ _id: nft.invention });
        if (inventionDoc) {
          if (!inventionDoc.createdBy) {
            inventionDoc.createdBy = inventionDoc.owner;
          }
          if (isCompanyWallet?.id ?? isCompanyWallet?._id) {
            inventionDoc.company = isCompanyWallet?.id ?? isCompanyWallet?._id;
            inventionDoc.owner = null;
          } else {
            inventionDoc.company = null;
            inventionDoc.owner = ownerProfileId;
          }
          await inventionDoc.save();
        }
      }

      // Convert priceOfNft to BigNumber
      let priceOfNftBigNumber;
      try {
        const hexValue =
          typeof priceOfNft === 'string'
            ? priceOfNft
            : priceOfNft?._hex || priceOfNft?.hex;
        priceOfNftBigNumber = ethers.BigNumber.from(hexValue);
      } catch (conversionError) {
        console.error(
          '[buyFixedTransaction] Error converting priceOfNft to BigNumber:',
          conversionError.message,
        );
        return res.status(400).json({
          success: false,
          message: `Invalid priceOfNft format: ${conversionError.message}`,
        });
      }

      const buyTxOptions = {};
      const onChainFixedPrice =
        await ideaMarketplaceContract.fixedPrice(tokenId);
      const listingPaymentToken = onChainFixedPrice.paymentToken;

      if (isEthPaymentToken(listingPaymentToken)) {
        buyTxOptions.value = priceOfNftBigNumber;
      } else {
        await ensureUsdtAllowance(
          signer,
          marketplaceContractAddress,
          priceOfNftBigNumber,
        );
      }

      const buyTx = await ideaMarketplaceContract.buyFixedPricePatentToken(
        tokenId,
        buyTxOptions,
      );

      const receipt = await buyTx.wait();

      const { transactionHash, from, to } = receipt;

      // ********************** nftActivity Table update *******************
      let priceInMatic;
      try {
        if (
          !priceOfNftBigNumber ||
          !ethers.BigNumber.isBigNumber(priceOfNftBigNumber)
        ) {
          throw new Error(
            'priceOfNftBigNumber is not a valid BigNumber before formatUnits',
          );
        }
        priceInMatic = formatListingPrice(
          priceOfNftBigNumber,
          listingPaymentToken,
        );
      } catch (formatError) {
        console.error('[buyFixedTransaction] Error in formatUnits:', {
          error: formatError.message,
          priceOfNftBigNumber,
          isBigNumber: priceOfNftBigNumber
            ? ethers.BigNumber.isBigNumber(priceOfNftBigNumber)
            : false,
        });
        return res.status(500).json({
          success: false,
          message: `Error formatting price: ${formatError.message}`,
        });
      }
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.SALE,
        price: priceInMatic,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      // ********************** Notifications **************************
      const buyerProfileId = req.user.id || req.user._id;
      const sellerProfileId = await resolveNftSellerProfile(nft);
      const isCompanyPurchase = Boolean(
        isCompanyWallet?.id ?? isCompanyWallet?._id,
      );
      const companyOwnerId = isCompanyPurchase ? isCompanyWallet?.owner : null;

      await sendNftPurchaseNotifications({
        buyerProfileId,
        sellerProfileId,
        companyOwnerId,
        isCompanyPurchase,
        itemId: nft._id,
        amount: priceInMatic,
        logPrefix: '[buyFixedTransaction]',
      });

      try {
        if (isCompanyPurchase) {
          queueDb.addToQueue(QUEUE_REWARD_DISTRIBUTE, {
            type: 'idea_reward',
            walletAddress,
            amount: 2,
            rewardedEntity: isCompanyWallet._id,
            rewardedEntityType: MODALS.TAG,
            sourceEntity: nft._id,
            sourceEntityType: MODALS.NFT,
            action: ROYALTY_COIN_ACTIONS.NFT_SALE,
          });

          await royaltyCoinRewardService.trackDistributedReward({
            rewardedEntity: isCompanyWallet._id,
            amount: 2,
            sourceEntity: nft._id,
            sourceEntityType: MODALS.NFT,
            rewardedEntityType: MODALS.TAG,
            action: ROYALTY_COIN_ACTIONS.NFT_SALE,
            status: 'pending',
          });
        } else {
          queueDb.addToQueue(QUEUE_REWARD_DISTRIBUTE, {
            type: 'idea_reward',
            walletAddress,
            amount: 2,
            rewardedEntity: getPk(req.user.id),
            rewardedEntityType: MODALS.PROFILE,
            sourceEntity: nft._id,
            sourceEntityType: MODALS.NFT,
            action: ROYALTY_COIN_ACTIONS.NFT_SALE,
          });

          await royaltyCoinRewardService.trackDistributedReward({
            rewardedEntity: getPk(req.user.id),
            amount: 2,
            sourceEntity: nft._id,
            sourceEntityType: MODALS.NFT,
            rewardedEntityType: MODALS.PROFILE,
            action: ROYALTY_COIN_ACTIONS.NFT_SALE,
          });
        }

        const reward = 2 * 0.1;

        // Always attempt campaign reward distribution to referring influencer
        const campaigns =
          (await completeCampaign(
            req.user.id,
            nft._id,
            TYPES.NFT,
            COMMON.PURCHASED_NFT,
          )) || [];
        const rewardedInfluencers = new Set();

        for (const campaign of campaigns) {
          const influencerId = campaign?.influencerId;
          if (!influencerId || rewardedInfluencers.has(String(influencerId))) {
            continue;
          }
          rewardedInfluencers.add(String(influencerId));

          if (campaign.walletAddress) {
            queueDb.addToQueue(QUEUE_REWARD_DISTRIBUTE, {
              type: 'idea_reward',
              walletAddress: campaign.walletAddress,
              amount: reward,
              rewardedEntity: influencerId,
              rewardedEntityType: MODALS.PROFILE,
              sourceEntity: getPk(nft),
              sourceEntityType: MODALS.NFT,
              action: ROYALTY_COIN_ACTIONS.NFT_SALE,
            });
          }

          await royaltyCoinRewardService.trackDistributedReward({
            rewardedEntity: influencerId,
            amount: reward,
            sourceEntity: getPk(nft),
            sourceEntityType: MODALS.NFT,
            rewardedEntityType: MODALS.PROFILE,
            action: ROYALTY_COIN_ACTIONS.NFT_SALE,
          });
        }
      } catch (rewardError) {
        console.error(
          '[buyFixedTransaction] Buy succeeded but reward distribution failed:',
          rewardError,
        );
      }

      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.BUY_NFT_FIXED_SUCCESS,
      });
    } catch (e) {
      console.error('[buyFixedTransaction] Error caught:', {
        message: e.message,
        stack: e.stack,
        error: e,
        reqBody: req.body,
      });
      return res.status(500).json({
        success: false,
        message: `${ERRORS.BUY_FIXED_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  listAuctionNftTransaction: async (req, res) => {
    try {
      const {
        listPrice,
        auctionStartTime,
        auctionEndTime,
        tokenId,
        usdPrice,
        walletAddress,
        paymentToken,
      } = req.body;

      if (
        !tokenId ||
        !listPrice ||
        !auctionStartTime ||
        !auctionEndTime ||
        !usdPrice ||
        !walletAddress
      ) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      const resolvedPaymentToken = resolvePaymentTokenAddress(
        paymentToken || usdtContractAddress,
      );
      if (
        !isEthPaymentToken(resolvedPaymentToken) &&
        resolvedPaymentToken.toLowerCase() !== usdtContractAddress.toLowerCase()
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment token. Only ETH or USDT are supported.',
        });
      }

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const startTime = Number(auctionStartTime);
      const endTime = Number(auctionEndTime);
      const twoMinutesInSeconds = 120; // 2 minute buffer for transaction processing

      if (startTime <= currentTimestamp) {
        return res.status(400).json({
          success: false,
          error: 'Auction start time must be greater than current time',
        });
      }

      if (startTime <= currentTimestamp + twoMinutesInSeconds) {
        return res.status(400).json({
          success: false,
          error:
            'Please increase auction start time as transaction takes time. Auction start time must be at least 2 minutes in the future.',
        });
      }

      if (endTime <= currentTimestamp) {
        return res.status(400).json({
          success: false,
          error: 'Auction end time must be greater than current time',
        });
      }

      if (endTime <= currentTimestamp + twoMinutesInSeconds) {
        return res.status(400).json({
          success: false,
          error:
            'Please increase auction end time as transaction takes time. Auction end time must be at least 2 minutes in the future.',
        });
      }

      if (startTime >= endTime) {
        return res.status(400).json({
          success: false,
          error: 'Auction start time must be less than end time',
        });
      }

      const isExpired = await checkNftExpiryFromContract(tokenId);
      if (isExpired) {
        return res.status(400).json({
          success: false,
          error: 'NFT has expired. Cannot list for auction.',
        });
      }

      const nft = await NFT.findOne({ tokenId }).populate({
        path: 'invention',
        populate: {
          path: 'crowdfundingCampaign',
          select: 'status', // Populate campaign to get status
        },
      });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      // ********************** NFT Table Update *******************

      const invention = nft?.invention;
      if (!invention) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const inventionId = invention._id || invention;
      const { quotationRequest, acceptedQuotation, crowdfundingCampaign } =
        invention;

      const isCampaignFulfilled =
        crowdfundingCampaign &&
        (typeof crowdfundingCampaign === 'object'
          ? crowdfundingCampaign.status
          : null) === STAKED_APPLICATION_STATUS.FULFILLED;

      if (!isCampaignFulfilled) {
        const blockingQuotations = await Quotation.find({
          invention: inventionId,
          status: {
            $in: [QUOTATION_STATUS.SENT, QUOTATION_STATUS.ACCEPTED],
          },
        });

        if (
          quotationRequest ||
          acceptedQuotation ||
          (blockingQuotations && blockingQuotations.length > 0)
        ) {
          return res.status(400).json({
            success: false,
            error: ERRORS.CANNOT_LIST_PATENT_TOKEN_QUOTATION_EXISTS,
          });
        }
      }

      const listPriceWei = parseRequestBigNumber(listPrice);
      const priceInMatic = formatListingPrice(
        listPriceWei,
        resolvedPaymentToken,
      );

      const listAuctionNftTxn =
        await ideaMarketplaceContract.listItemForAuction(
          listPriceWei,
          auctionStartTime,
          auctionEndTime,
          tokenId,
          marketplaceContractAddress,
          resolvedPaymentToken,
        );

      const receipt = await listAuctionNftTxn.wait(2);

      const { transactionHash, from, to } = receipt;

      const updatedData = {
        isListed: true,
        maticPrice: priceInMatic,
        usdPrice: usdPrice,
        paymentToken: resolvedPaymentToken,
        onAuction: true,
        expiryDate: new Date(auctionEndTime * 1000),
        auctionStartTime: new Date(auctionStartTime * 1000),
        event: NFT_EVENTS.LIST,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      // ********************** nftActivity Table update *******************
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.LIST,
        price: priceInMatic,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      // ********************** Subtract Credits *******************
      const creditsHistory = {
        _id: new ObjectId(),
        action: CREDIT_ACTIONS.LIST_NFT,
      };

      await subtractCredits(
        req.user.id,
        10,
        creditsHistory,
        null,
        GENERATION_TYPES.NFT_TRANSACTION,
        false,
      );

      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.NFT_AUCTION_LIST_SUCCESS,
        transactionHash: transactionHash,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.LIST_AUCTION_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  async cancelAuctionTransaction(req, res) {
    try {
      const { tokenId, priceOfNft } = req.body;
      let priceForActivity = null;
      if (priceOfNft && priceOfNft !== 0) {
        priceForActivity = ethers.utils.formatUnits(priceOfNft, 18);
      }

      if (!tokenId) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      // ********************** NFT Table Update *******************
      const nft = await NFT.findOne({ tokenId });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const updatedData = {
        isListed: false,
        maticPrice: null,
        usdPrice: null,
        onAuction: false,
        expiryDate: null,
        auctionStartTime: null,
        event: NFT_EVENTS.CANCEL,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      // ********************** BID Table update **************************
      const bidCount = await mongoose
        .model(MODALS.BID)
        .countDocuments({ tokenId: nft._id });
      if (bidCount >= 1) {
        await mongoose.model(MODALS.BID).deleteMany({ tokenId: nft._id });
      }

      // Get listing owner from the contract (not on-chain NFT owner, as NFT is in marketplace)
      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        provider,
      );

      const auctionData = await ideaMarketplaceContract.auction(tokenId);
      const auctionOwnerAddress = auctionData.patentTokenOwner.toLowerCase();

      const ownerPrivateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        auctionOwnerAddress,
      );

      const signer = new ethers.Wallet(ownerPrivateKey, provider);
      const contractWithSigner = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      const cancelAuctionNftTxn =
        await contractWithSigner.cancelListingForAuction(tokenId);

      const receipt = await cancelAuctionNftTxn.wait();
      const { transactionHash, from, to } = receipt;

      // ********************** nftActivity Table update *******************
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.CANCEL,
        price: priceForActivity,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.NFT_CANCEL_AUCTION_SUCCESS,
        transactionHash,
        from,
        to,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.CANCEL_AUCTION_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  async getHighestBidOffer(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'Token id is required' });
      }

      const data = await mongoose
        .model(MODALS.BID)
        .find({ tokenId: id })
        .sort({ maticPrice: -1 })
        .populate({
          path: COMMON.USER_ID,
          model: MODALS.PROFILE,
        });

      res.json({ data });
    } catch (error) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(error);
    }
  },

  async createBid({ tokenId, userId, usdPrice, maticPrice }) {
    try {
      const highestBid = await mongoose
        .model(MODALS.BID)
        .findOne({ tokenId })
        .sort({ maticPrice: -1 })
        .limit(1)
        .populate({
          path: COMMON.USER_ID,
          model: MODALS.PROFILE,
        });

      const isHighestBidder = highestBid?.userId?._id?.toString() === userId;

      const response = await mongoose
        .model(MODALS.BID)
        .findOneAndUpdate(
          { tokenId, userId },
          { usdPrice, maticPrice },
          { new: true, upsert: true },
        );

      const sendEmail = highestBid && !isHighestBidder;

      if (sendEmail) {
        const nft = await mongoose.model(MODALS.NFT).findOne({ _id: tokenId });

        queueDb.addToQueue(QUEUE_NFT_EMAILS, {
          type: 'bidder',
          email: highestBid?.userId?.email,
          username: highestBid?.userId?.username,
          websiteUrl: `${process.env.CLIENT_HOST}/marketplace/${nft?._id}`,
          inventionTitle: nft?.name,
          inventionUrl: `${process.env.CLIENT_HOST}/inventions/${nft?.invention}`,
          bidAmount: response?.maticPrice,
        });

        // queueDb.createWorker(QUEUE_NFT_EMAILS, async (item) => {
        //   await sendNftBidderEmail(item.data);
        // });
      }
    } catch (error) {
      throw error;
    }
  },

  async distributeNftReferralReward(userId, itemId, baseAmount = 2) {
    try {
      const reward = baseAmount * 0.1;

      const campaigns =
        (await completeCampaign(
          userId,
          itemId,
          TYPES.NFT,
          COMMON.PURCHASED_NFT,
        )) || [];
      const rewardedInfluencers = new Set();

      for (const campaign of campaigns) {
        const influencerId = campaign?.influencerId;
        if (!influencerId || rewardedInfluencers.has(String(influencerId))) {
          continue;
        }
        rewardedInfluencers.add(String(influencerId));

        if (campaign.walletAddress) {
          queueDb.addToQueue(QUEUE_REWARD_DISTRIBUTE, {
            type: 'idea_reward',
            walletAddress: campaign.walletAddress,
            amount: reward,
            rewardedEntity: influencerId,
            rewardedEntityType: MODALS.PROFILE,
            sourceEntity: getPk(itemId),
            sourceEntityType: MODALS.NFT,
            action: ROYALTY_COIN_ACTIONS.NFT_SALE,
          });
        }

        await royaltyCoinRewardService.trackDistributedReward({
          rewardedEntity: influencerId,
          amount: reward,
          sourceEntity: getPk(itemId),
          sourceEntityType: MODALS.NFT,
          rewardedEntityType: MODALS.PROFILE,
          action: ROYALTY_COIN_ACTIONS.NFT_SALE,
        });
      }

      return {
        success: true,
        data: {
          userId,
          baseAmount,
          reward,
          rewardedInfluencers: [...rewardedInfluencers],
        },
      };
    } catch (error) {
      console.error(
        '[distributeNftReferralReward] Failed to distribute referral reward:',
        error?.message || error,
      );
      return { success: false, error: error?.message || error };
    }
  },

  async bidTransaction(req, res) {
    try {
      const { auctionId, bidAmount, usdPrice, walletAddress } = req.body;
      if (!auctionId || !bidAmount || !usdPrice || !walletAddress) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }
      let encryptedPrivateKey;

      const isProfileWallet = await mongoose
        .model(MODALS.PROFILE)
        .findOne({ walletAddress })
        .lean();

      if (isProfileWallet) {
        encryptedPrivateKey = isProfileWallet?.privateKey;
      }

      const isCompanyWallet = await mongoose
        .model(MODALS.TAG)
        .findOne({ walletAddress })
        .lean();

      if (isCompanyWallet) {
        encryptedPrivateKey = isCompanyWallet?.privateKey;
      }

      const privateKey = decryptPrivateKey(encryptedPrivateKey);
      const signer = new ethers.Wallet(privateKey, provider);

      // Verify seller cannot bid on their own NFT
      const ideaMarketplaceContractRead = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        provider,
      );
      const auctionData = await ideaMarketplaceContractRead.auction(auctionId);
      const sellerAddress = auctionData.patentTokenOwner.toLowerCase();
      const bidderAddress = signer.address.toLowerCase();

      if (bidderAddress === sellerAddress) {
        return res.status(403).json({
          success: false,
          error: 'Seller cannot bid on their own NFT',
        });
      }

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const auctionStartTime = Number(auctionData.auctionStartTime.toString());
      const auctionEndTime = Number(auctionData.auctionEndTime.toString());

      if (currentTimestamp < auctionStartTime) {
        return res.status(400).json({
          success: false,
          error: 'Auction has not started yet',
        });
      }

      if (currentTimestamp >= auctionEndTime) {
        return res.status(400).json({
          success: false,
          error: 'Auction end time has been reached. Cannot place bid.',
        });
      }

      // Check NFT expiry time from contract before bidding
      const tokenId = Number(auctionData.tokenId.toString());
      const isExpired = await checkNftExpiryFromContract(tokenId);
      if (isExpired) {
        return res.status(400).json({
          success: false,
          error: 'NFT has expired. Cannot place bid.',
        });
      }

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      const listingPaymentToken = auctionData.paymentToken;
      const isEthListing = isEthPaymentToken(listingPaymentToken);
      const bidDecimals = isEthListing ? TOKEN_DECIMALS : DEFAULT_USDT_DECIMALS;
      const bidAmountWei = ethers.utils.parseUnits(
        Number(bidAmount).toFixed(bidDecimals),
        bidDecimals,
      );

      let bidTxn;
      if (isEthListing) {
        bidTxn = await ideaMarketplaceContract.startBid(auctionId, 0, {
          value: bidAmountWei,
        });
      } else {
        await ensureUsdtAllowance(
          signer,
          marketplaceContractAddress,
          bidAmountWei,
        );
        bidTxn = await ideaMarketplaceContract.startBid(
          auctionId,
          bidAmountWei,
        );
      }

      const receipt = await bidTxn.wait(2);

      const { transactionHash, from, to } = receipt;

      /***********************************************/
      const nft = await NFT.findOne({ tokenId: auctionId });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      // ********************** nftActivity Table update *******************
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.BID,
        price: bidAmount,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      await blockchainController.createBid({
        tokenId: nft._id,
        userId: req.user.id,
        usdPrice,
        maticPrice: Number(bidAmount),
      });

      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.BID_TRANSACTION_SUCCESS,
        transactionHash: transactionHash,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.BID_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  async acceptOfferTransaction(req, res) {
    try {
      const { auctionId, bidOwnerId, walletAddress } = req.body;
      if (!auctionId || !bidOwnerId || !walletAddress) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      const ideaMarketplaceContractRead = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        provider,
      );

      const auctionData = await ideaMarketplaceContractRead.auction(auctionId);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const auctionEndTime = Number(auctionData.auctionEndTime.toString());
      const nftOwnerAddress = auctionData.patentTokenOwner.toLowerCase();

      if (walletAddress.toLowerCase() !== nftOwnerAddress) {
        return res.status(403).json({
          success: false,
          error: `Wallet address does not match NFT owner. NFT owner: ${nftOwnerAddress}`,
        });
      }

      if (auctionData.isSold) {
        return res.status(400).json({
          success: false,
          error: 'Auction has already ended. Cannot accept offer.',
        });
      }

      if (currentTimestamp >= auctionEndTime) {
        return res.status(400).json({
          success: false,
          error: 'Auction end time has been reached. Cannot accept offer.',
        });
      }

      const timeUntilEnd = auctionEndTime - currentTimestamp;
      const twoMinutesInSeconds = 2 * 60;
      if (timeUntilEnd < twoMinutesInSeconds) {
        return res.status(400).json({
          success: false,
          error:
            'Accept offer before the 2 minutes from the auction end time as transaction takes time.',
        });
      }

      const tokenId = Number(auctionData.tokenId.toString());
      const isExpired = await checkNftExpiryFromContract(tokenId);
      if (isExpired) {
        return res.status(400).json({
          success: false,
          error: 'NFT has expired. Cannot accept offer.',
        });
      }

      // Now get private key and create signer (after verification)
      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      const acceptOfferTxn =
        await ideaMarketplaceContract.auctionEnd(auctionId);
      const receipt = await acceptOfferTxn.wait();

      const { transactionHash, from, to } = receipt;

      const ownerProfileId = await getOwnerProfileIdForWallet(
        bidOwnerId || req.user.id || req.user._id,
      );

      const user = await mongoose.model(MODALS.PROFILE).findOne({
        _id: ownerProfileId,
        walletAddress: {
          $ne: '',
          $exists: true,
          $type: 'string',
        },
      });

      await finalizeAuctionSettlement({
        auctionData,
        ownerProfileId,
        walletAddressForRewards: user?.walletAddress,
        eventType: NFT_EVENTS.ACCEPT,
        txFrom: from,
        txTo: to,
        txHash: transactionHash,
      });
      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.NFT_ACCEPT_OFFER_SUCCESS,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.ACCEPT_OFFER_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  async claimNftTransaction(req, res) {
    try {
      const { auctionId, walletAddress } = req.body;
      if (!auctionId || !walletAddress) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }
      const ideaMarketplaceContractRead = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        provider,
      );
      const auctionData = await ideaMarketplaceContractRead.auction(auctionId);

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      // Verify only the highest bidder can claim
      const highestBidderAddress = auctionData.currentBidder.toLowerCase();
      const claimerAddress = signer.address.toLowerCase();

      if (claimerAddress !== highestBidderAddress) {
        return res.status(403).json({
          success: false,
          error: 'Only the highest bidder can claim this NFT',
        });
      }

      const signerContract = new ethers.Contract(
        marketplaceContractAddress,
        PatentMarketplaceAbi,
        signer,
      );

      const claimNftTxn = await signerContract.claimPatentToken(auctionId);
      const receipt = await claimNftTxn.wait();

      const { transactionHash, from, to } = receipt;

      let ownerProfileId = req.user.id || req.user._id;
      const userWalletLower = (req.user.walletAddress || '').toLowerCase();
      const targetWalletLower = walletAddress.toLowerCase();

      if (targetWalletLower !== userWalletLower) {
        ownerProfileId = await getOwnerProfileIdForWallet(ownerProfileId);
      }

      await finalizeAuctionSettlement({
        auctionData,
        ownerProfileId,
        walletAddressForRewards: walletAddress,
        eventType: NFT_EVENTS.CLAIM,
        txFrom: from,
        txTo: to,
        txHash: transactionHash,
      });

      triggerNftUpdated();

      return res.json({
        success: true,
        message: COMMON.CLAIM_NFT_SUCCESS,
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.CLAIM_NFT_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },
};

blockchainController.getPrivateKeyForWalletAddress =
  getPrivateKeyForWalletAddress;

blockchainController.sendEthereum = async (req, res) => {
  try {
    const { to, amount, walletAddress: providedWalletAddress } = req.body;

    if (!to || !ethers.utils.isAddress(to)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INVALID_ADDRESS,
      });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INVALID_AMOUNT,
      });
    }

    let walletAddress = providedWalletAddress;
    if (!walletAddress) {
      // Fallback: Get wallet address from user or company
      walletAddress = req.user.walletAddress;
      const Tag = mongoose.model(MODALS.TAG);
      const company = await Tag.findOne({
        $or: [{ owner: req.user.id }, { employees: { $in: [req.user.id] } }],
      });

      if (company?.walletAddress) {
        walletAddress = company.walletAddress;
      }
    }

    if (!walletAddress) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.WALLET_ADDRESS_NOT_FOUND,
      });
    }

    const privateKey = await getPrivateKeyForWalletAddress(
      req.user.id,
      walletAddress,
    );

    const signer = new ethers.Wallet(privateKey, provider);
    const weiAmount = ethers.utils.parseEther(amount.toString());

    const balance = await provider.getBalance(walletAddress);
    if (balance.lt(weiAmount)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INSUFFICIENT_BALANCE,
      });
    }

    const tx = await signer.sendTransaction({
      to,
      value: weiAmount,
    });

    const receipt = await tx.wait();

    const transactionHash =
      receipt.transactionHash || receipt.hash || receipt.transaction?.hash;
    const blockNumber = receipt.blockNumber
      ? typeof receipt.blockNumber === 'object' && receipt.blockNumber.toString
        ? receipt.blockNumber.toString()
        : String(receipt.blockNumber)
      : null;

    return res.json({
      success: true,
      transactionHash: transactionHash,
      blockNumber: blockNumber,
      message: COMMON.TRANSACTION_SUCCESS,
    });
  } catch (error) {
    console.error('[sendEthereum] Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: `${ERRORS.SEND_ETHEREUM_FAILED}: ${error.message}`,
    });
  }
};

blockchainController.approveIdeaCoin = async (req, res) => {
  try {
    const { spender, amount, walletAddress: providedWalletAddress } = req.body;

    if (!spender || !ethers.utils.isAddress(spender)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INVALID_ADDRESS,
      });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INVALID_AMOUNT,
      });
    }

    let walletAddress = providedWalletAddress;
    if (!walletAddress) {
      // Fallback: Get wallet address from user or company
      walletAddress = req.user.walletAddress;
      const Tag = mongoose.model(MODALS.TAG);
      const company = await Tag.findOne({
        $or: [{ owner: req.user.id }, { employees: { $in: [req.user.id] } }],
      });

      if (company?.walletAddress) {
        walletAddress = company.walletAddress;
      }
    }

    if (!walletAddress) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.WALLET_ADDRESS_NOT_FOUND,
      });
    }

    const privateKey = await getPrivateKeyForWalletAddress(
      req.user.id,
      walletAddress,
    );

    const signer = new ethers.Wallet(privateKey, provider);
    const contractWithSigner = ideaCoinContract.connect(signer);

    const decimals = await ideaCoinContract.decimals();
    const amountInUnits = ethers.utils.parseUnits(amount.toString(), decimals);

    const balance = await ideaCoinContract.balanceOf(walletAddress);
    if (balance.lt(amountInUnits)) {
      console.error('[approveIdeaCoin] Insufficient balance', {
        walletAddress,
        balance: balance.toString(),
        required: amountInUnits.toString(),
        decimals,
      });

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INSUFFICIENT_BALANCE,
      });
    }

    const tx = await contractWithSigner.approve(spender, amountInUnits);

    const receipt = await tx.wait();

    const transactionHash =
      receipt.transactionHash || receipt.hash || receipt.transaction?.hash;
    const blockNumber = receipt.blockNumber
      ? typeof receipt.blockNumber === 'object' && receipt.blockNumber.toString
        ? receipt.blockNumber.toString()
        : String(receipt.blockNumber)
      : null;

    return res.json({
      success: true,
      transactionHash: transactionHash,
      blockNumber: blockNumber,
      message: COMMON.TRANSACTION_SUCCESS,
    });
  } catch (error) {
    console.error('[approveIdeaCoin] Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: `Failed to approve IdeaCoin: ${error.message}`,
    });
  }
};

blockchainController.sendRoyaltyCoin = async (req, res) => {
  try {
    const { to, amount, walletAddress: providedWalletAddress } = req.body;

    if (!to || !ethers.utils.isAddress(to)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INVALID_ADDRESS,
      });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INVALID_AMOUNT,
      });
    }

    let walletAddress = providedWalletAddress;
    if (!walletAddress) {
      // Fallback: Get wallet address from user or company
      walletAddress = req.user.walletAddress;
      const Tag = mongoose.model(MODALS.TAG);
      const company = await Tag.findOne({
        $or: [{ owner: req.user.id }, { employees: { $in: [req.user.id] } }],
      });

      if (company?.walletAddress) {
        walletAddress = company.walletAddress;
      }
    }

    if (!walletAddress) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.WALLET_ADDRESS_NOT_FOUND,
      });
    }

    const privateKey = await getPrivateKeyForWalletAddress(
      req.user.id,
      walletAddress,
    );

    const signer = new ethers.Wallet(privateKey, provider);
    const contractWithSigner = ideaCoinContract.connect(signer);

    const decimals = await ideaCoinContract.decimals();

    const amountInUnits = ethers.utils.parseUnits(amount.toString(), decimals);

    const balance = await ideaCoinContract.balanceOf(walletAddress);
    if (balance.lt(amountInUnits)) {
      console.error('[sendRoyaltyCoin] Insufficient balance', {
        walletAddress,
        balance: balance.toString(),
        required: amountInUnits.toString(),
        decimals,
      });

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INSUFFICIENT_BALANCE,
      });
    }

    const tx = await contractWithSigner.transfer(to, amountInUnits);

    const receipt = await tx.wait();

    const transactionHash =
      receipt.transactionHash || receipt.hash || receipt.transaction?.hash;
    const blockNumber = receipt.blockNumber
      ? typeof receipt.blockNumber === 'object' && receipt.blockNumber.toString
        ? receipt.blockNumber.toString()
        : String(receipt.blockNumber)
      : null;

    return res.json({
      success: true,
      transactionHash: transactionHash,
      blockNumber: blockNumber,
      message: COMMON.TRANSACTION_SUCCESS,
    });
  } catch (error) {
    console.error('[sendRoyaltyCoin] Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: `${ERRORS.SEND_ROYALTY_COIN_FAILED}: ${error.message}`,
    });
  }
};

module.exports = blockchainController;

nodeCron.schedule('*/5 * * * *', () => {
  console.log('Running monitorUsdtBalance every 5 minutes');
  blockchainController.monitorUsdtBalance();
});

nodeCron.schedule('0 0 * * *', async () => {
  console.log('Running daily USDT reward distribution job...');
  try {
    const pendingRewards = await mongoose
      .model(MODALS.REWARD_DISTRIBUTION_HISTORY)
      .find({ status: PAY_STATUS.PENDING })
      .populate({ path: COMMON.USER, model: MODALS.PROFILE });

    if (pendingRewards?.length === 0) {
      console.log('No pending rewards found.');
      return;
    }

    for (const reward of pendingRewards) {
      const jobData = {
        type: 'crowdfunding',
        rewardId: reward?._id ?? reward?.id,
        userId: reward?.user?.id ?? reward?.user?._id,
        walletAddress: reward?.user?.walletAddress,
        share: reward?.share,
      };
      queueDb.addToQueue(QUEUE_REWARD_DISTRIBUTE, jobData);
    }
  } catch (err) {
    console.log('USDT reward distribution job failed:', err);
  }
});
