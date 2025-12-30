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
const { RewardIteration } = require('../models/RewardIteration');
const {
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
  PAY_STATUS,
  STAKED_APPLICATION_STATUS,
} = require('../consts/index');
const {
  QUEUE_NFT_EMAILS,
  queueDb,
  SEND_CLAIM_YOUR_REWARD_EMAIL,
  QUEUE_REWARD_DISTRIBUTE,
} = require('../helpers/queueDb');
const pusher = require('../pusherConfig');
const { NFT } = require('../models/NFT');
const { NftActivity } = require('../models/nftActivity');
const {
  subtractCredits,
  isCompanyEmployeeOrOwner,
} = require('../helpers/credits');
const { ObjectId } = require('mongodb');
const { completeCampaign } = require('../helpers/rewardDistribution');
const {
  ideaCoinContract,
  maticContract,
  provider,
  wallet,
  updateUser,
} = require('../helpers/blockchain');

// Load environment variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = resolve(__dirname, `../../env/.env.${NODE_ENV}`);
config({ path: envPath });

// Initialize Ethereum provider, wallet, and contract
const {
  MARKETPLACE_CONTRACT_ADDRESS: marketplaceContractAddress,
  NFT_CONTRACT_ADDRESS: nftContractAddress,
} = process.env;

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
  const Tag = mongoose.model(MODALS.TAG);
  const company = await Tag.findOne({
    $or: [{ owner: userId }, { employees: { $in: [userId] } }],
  });

  // Check if wallet belongs to company
  if (
    company?.walletAddress?.toLowerCase() === targetWalletAddress.toLowerCase()
  ) {
    return getDecryptedPrivateKey(company);
  }

  // Check if wallet belongs to user
  const userProfile = await mongoose.model(MODALS.PROFILE).findById(userId);
  if (
    userProfile?.walletAddress?.toLowerCase() ===
    targetWalletAddress.toLowerCase()
  ) {
    return getDecryptedPrivateKey(userProfile);
  }

  throw new Error('Wallet address does not match user or company wallet');
}

async function getPrivateKeyForListingOwner(userId, listingOwnerAddress) {
  return getPrivateKeyForWalletAddress(userId, listingOwnerAddress);
}

async function checkNftExpiryFromContract(tokenId) {
  try {
    const ideaNftContract = new ethers.Contract(
      nftContractAddress,
      require('../contract/IdeaNft.json'),
      provider,
    );
    const expiryTime = await ideaNftContract.getNFTExpireTime(tokenId);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return Number(expiryTime.toString()) <= currentTimestamp;
  } catch (error) {
    console.error('Error checking NFT expiry:', error);
    return false;
  }
}

// Blockchain controller object
const blockchainController = {
  distributeIdeaRewards: async (address, amount) => {
    // Validate input parameters
    if (!address || !amount) {
      throw new Error(ERRORS.INVALID_PARAMETER);
    }

    if (!ethers.utils.isAddress(address)) {
      throw new Error(ERRORS.INVALID_ADDRESS);
    }

    const requestedAmount = ethers.utils.parseUnits(amount.toString(), 18);
    if (requestedAmount.lte(0)) {
      throw new Error(ERRORS.INVALID_AMOUNT);
    }

    try {
      const remainingSupply = await ideaCoinContract.remainingSupply();
      const maxSupply = ethers.utils.parseUnits(COMMON.TOKEN_THRESHOLD, 18);
      const adjustedFactor = requestedAmount
        .mul(remainingSupply)
        .div(maxSupply);

      if (adjustedFactor.gt(remainingSupply)) {
        throw new Error(ERRORS.AMOUNT_EXCEEDED);
      }

      // Distribute Idea rewards
      const tx = await ideaCoinContract.distributeIdeaReward(
        address,
        requestedAmount,
      );

      const receipt = await tx.wait();
      const rewardEvent = receipt.events.find(
        (event) => event.event === EVENTS.REWARD_DISTRIBUTED,
      );
      const adjustedAmountEth = ethers.utils.formatEther(
        rewardEvent.args.amount,
      );

      return {
        success: true,
        message: COMMON.IDEA_REWARD_DISTRIBUTED,
        adjustedAmountEth,
      };
    } catch (error) {
      console.error(ERRORS.TRANSACTION_FAILED, error);
      throw new Error(`${ERRORS.TRANSACTION_FAILED}: ${error.message}`);
    }
  },

  getRewardsPoolThreshold: async (req, res) => {
    try {
      const latestRewardIteration = await getLatestRewardIteration();
      res.json(latestRewardIteration);
    } catch (error) {
      console.error(ERRORS.GET_REWARD_THRESHOLD, error);
      res.status(500).json({ error: ERRORS.GET_REWARD_THRESHOLD });
    }
  },

  distributeMaticRewards: async (req, res) => {
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

      const maticAmount = ethers.utils.parseUnits(amount.toString(), 18);
      if (maticAmount.lte(0)) {
        throw new Error(ERRORS.INVALID_AMOUNT);
      }

      const ideaBalance = await ideaCoinContract.balanceOf(address);
      if (ideaBalance.eq(0)) {
        throw new Error(ERRORS.IDEACOINS_INSUFFICIENT);
      }

      const ownerMaticBalance = await maticContract.balanceOf(wallet.address);
      if (maticAmount.gte(ownerMaticBalance)) {
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
      async function approveMaticSpend(owner, spender, amount) {
        const tx = await maticContract.connect(wallet).approve(spender, amount);
        await tx.wait();
      }

      await approveMaticSpend(
        wallet.address,
        ideaCoinContract.address,
        maticAmount,
      );

      // Distribute MATIC rewards
      pusher.trigger(
        `${CHANNELS.DISTRIBUTE_REWARD}-${address}`,
        EVENTS.LOADING,
        {
          type: COMMON.INFO,
          message: COMMON.FEW_MORE_MOMENTS,
        },
      );
      const tx = await ideaCoinContract.distributeMaticReward(
        address,
        maticAmount,
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
        message: COMMON.MATIC_REWARD_DISTRIBUTED,
      });
    } catch (error) {
      console.error(ERRORS.TRANSACTION_FAILED, error);
      return res.status(500).json({
        success: false,
        message: `${ERRORS.TRANSACTION_FAILED}: ${error.message}`,
      });
    }
  },

  monitorMaticBalance: async () => {
    try {
      const ownerMaticBalance = await provider.getBalance(wallet.address);
      console.log(
        `Checked owner's MATIC balance: ${ethers.utils.formatEther(
          ownerMaticBalance,
        )} MATIC`,
      );
      const { threshold } = await getLatestRewardIteration();
      if (ethers.utils.formatEther(ownerMaticBalance) >= threshold) {
        console.log('Threshold met. Checking eligible addresses...');
        const eligibleUsers = await _getEligibleAddresses(); // Get Users that have IdeaCoins > 0

        let totalRewardsDistributed =
          await ideaCoinContract.totalRewardsDistributed();
        totalRewardsDistributed = formatBalance(totalRewardsDistributed);

        const userShares = await Promise.all(
          eligibleUsers.map(async (user) => {
            const ideaBalance = ethers.utils.formatUnits(user.ideaCoins, 18);
            const userShare =
              (ideaBalance * threshold) / totalRewardsDistributed.toFixed(12);
            sendEmailViaQueue(user, userShare);
            return { id: user._id, address: user.walletAddress, userShare };
          }),
        );
        userShares.forEach(async (obj) => {
          await updateUser(obj.id, {
            $inc: { share: obj.userShare.toFixed(12) },
          });
          await mongoose.model(MODALS.REWARD_DISTRIBUTION_HISTORY).create({
            user: obj.id,
            share: obj.userShare.toFixed(12),
            status: PAY_STATUS.PENDING,
          });
        });

        const maticThreshold = (threshold * 125) / 100;
        await insertRewardIteration(maticThreshold);
        console.log(`New threshold is ${maticThreshold} MATIC`);
        return;
      } else {
        console.log('Threshold not met. No action taken.');
      }
    } catch (error) {
      console.error(ERRORS.MATIC_BALANCE_MONITORING_ERROR, error);
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

      const nft = await NFT.findOne({ tokenId });
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

      const ideaNftContract = new ethers.Contract(
        process.env.NFT_CONTRACT_ADDRESS,
        require('../contract/IdeaNft.json'),
        signer,
      );

      const tx = await ideaNftContract.approve(
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
      const { tokenId, listPrice, usdPrice, walletAddress } = req.body;
      if (!tokenId || !listPrice || !usdPrice || !walletAddress) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      // ********************** NFT Table Update *******************
      const nft = await NFT.findOne({ tokenId }).populate('invention');

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      // Check if crowdfunding campaign is active
      if (nft?.invention?.crowdfundingCampaign) {
        const CrowdfundingCampaign = mongoose.model(MODALS.CROWDFUNDING_CAMPAIGN);
        const campaign = await CrowdfundingCampaign.findById(
          nft.invention.crowdfundingCampaign
        );
        if (
          campaign &&
          (campaign.status === STAKED_APPLICATION_STATUS.IN_PROGRESS ||
            campaign.status === STAKED_APPLICATION_STATUS.FULFILLED)
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Cannot list Patent Token. A crowdfunding campaign is currently in progress or has been completed.',
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
        require('../contract/IdeaMarketplace.json'),
        signer,
      );

      const priceInMatic = ethers.utils.formatUnits(listPrice, 18);

      const listFixedNftTxn =
        await ideaMarketplaceContract.listNftForFixedPrice(
          tokenId,
          listPrice,
          nftContractAddress,
        );

      const receipt = await listFixedNftTxn.wait(2);

      const { transactionHash, from, to } = receipt;

      const updatedData = {
        isListed: true,
        maticPrice: priceInMatic,
        usdPrice: usdPrice,
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

      const isOwnerOrEmployee = await isCompanyEmployeeOrOwner(
        req?.user?.id,
        nft,
      );

      await subtractCredits(
        req.user.id,
        10,
        creditsHistory,
        null,
        GENERATION_TYPES.NFT_TRANSACTION,
        false,
        isOwnerOrEmployee,
      );

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
        require('../contract/IdeaMarketplace.json'),
        provider,
      );
      const fixedPriceData =
        await ideaMarketplaceContractRead.fixedPrice(tokenId);
      const listingOwnerAddress = fixedPriceData.owner.toLowerCase();

      const ownerPrivateKey = await getPrivateKeyForListingOwner(
        req.user.id,
        listingOwnerAddress,
      );
      const signer = new ethers.Wallet(ownerPrivateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
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
      const { tokenId, priceOfNft } = req.body;
      if (!tokenId || !priceOfNft) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }
      let signer = null;

      const company = await mongoose.model(MODALS.TAG).findOne({
        $or: [
          { owner: req?.user?.id },
          { employees: { $in: [req?.user?.id] } },
        ],
      });

      if (company?.id ?? company?._id) {
        const companyPrivateKey = getDecryptedPrivateKey(company);
        signer = new ethers.Wallet(companyPrivateKey, provider);
      } else {
        const privateKey = getDecryptedPrivateKey(req.user);
        signer = new ethers.Wallet(privateKey, provider);
      }

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer,
      );

      // ********************** NFT Table Update *******************
      const nft = await NFT.findOne({ tokenId });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const updatedData = {
        owner: req.user.id,
        isListed: false,
        maticPrice: null,
        usdPrice: null,
        event: NFT_EVENTS.BUY,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      const buyTx = await ideaMarketplaceContract.buyFixedPriceNft(tokenId, {
        value: priceOfNft,
      });

      const receipt = await buyTx.wait();

      const { transactionHash, from, to } = receipt;

      // ************************ Application Table update **************************
      if (nft.invention) {
        await mongoose
          .model(MODALS.APPLICATION)
          .findOneAndUpdate(
            { _id: nft.invention },
            { owner: req.user.id },
            { upsert: false },
          );
      }

      // ********************** nftActivity Table update *******************
      const priceInMatic = ethers.utils.formatUnits(priceOfNft, 18);
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.SALE,
        price: priceInMatic,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);
      if (company?.id ?? company?._id) {
        await blockchainController.distributeIdeaRewards(
          company?.walletAddress,
          2,
        );
      } else {
        await blockchainController.distributeIdeaRewards(
          req.user.walletAddress,
          2,
        );
      }

      const reward = 2 * 0.1;

      // Always attempt campaign reward distribution
      const walletAddress = await completeCampaign(
        req.user.id,
        nft._id,
        TYPES.NFT,
        COMMON.PURCHASED_NFT,
      );

      if (walletAddress) {
        await blockchainController.distributeIdeaRewards(walletAddress, reward);
      }

      return res.json({
        success: true,
        message: COMMON.BUY_NFT_FIXED_SUCCESS,
      });
    } catch (e) {
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

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer,
      );

      // ********************** NFT Table Update *******************
      const nft = await NFT.findOne({ tokenId }).populate('invention');

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      // Check if crowdfunding campaign is active
      if (nft?.invention?.crowdfundingCampaign) {
        const CrowdfundingCampaign = mongoose.model(MODALS.CROWDFUNDING_CAMPAIGN);
        const campaign = await CrowdfundingCampaign.findById(
          nft.invention.crowdfundingCampaign
        );
        if (
          campaign &&
          (campaign.status === STAKED_APPLICATION_STATUS.IN_PROGRESS ||
            campaign.status === STAKED_APPLICATION_STATUS.FULFILLED)
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Cannot list Patent Token. A crowdfunding campaign is currently in progress or has been completed.',
          });
        }
      }

      const priceInMatic = ethers.utils.formatUnits(listPrice, 18);

      const listAuctionNftTxn =
        await ideaMarketplaceContract.listItemForAuction(
          listPrice,
          auctionStartTime,
          auctionEndTime,
          tokenId,
          nftContractAddress,
        );

      const receipt = await listAuctionNftTxn.wait(2);

      const { transactionHash, from, to } = receipt;

      const updatedData = {
        isListed: true,
        maticPrice: priceInMatic,
        usdPrice: usdPrice,
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

      const isOwnerOrEmployee = await isCompanyEmployeeOrOwner(
        req?.user?.id,
        nft,
      );

      await subtractCredits(
        req.user.id,
        10,
        creditsHistory,
        null,
        GENERATION_TYPES.NFT_TRANSACTION,
        false,
        isOwnerOrEmployee,
      );

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
        require('../contract/IdeaMarketplace.json'),
        provider,
      );

      const auctionData = await ideaMarketplaceContract.auction(tokenId);
      const auctionOwnerAddress = auctionData.nftOwner.toLowerCase();

      const ownerPrivateKey = await getPrivateKeyForListingOwner(
        req.user.id,
        auctionOwnerAddress,
      );

      const signer = new ethers.Wallet(ownerPrivateKey, provider);
      const contractWithSigner = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
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

  async bidTransaction(req, res) {
    try {
      const { auctionId, bidAmount, usdPrice, walletAddress } = req.body;
      if (!auctionId || !bidAmount || !usdPrice || !walletAddress) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      // Verify seller cannot bid on their own NFT
      const ideaMarketplaceContractRead = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        provider,
      );
      const auctionData = await ideaMarketplaceContractRead.auction(auctionId);
      const sellerAddress = auctionData.nftOwner.toLowerCase();
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
        require('../contract/IdeaMarketplace.json'),
        signer,
      );

      const bidTxn = await ideaMarketplaceContract.startBid(auctionId, {
        value: ethers.utils.parseUnits(bidAmount, 'ether'),
      });

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

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer,
      );

      const auctionData = await ideaMarketplaceContract.auction(auctionId);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const auctionEndTime = Number(auctionData.auctionEndTime.toString());

      if (currentTimestamp >= auctionEndTime) {
        return res.status(400).json({
          success: false,
          error: 'Auction end time has been reached. Cannot accept offer.',
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

      const acceptOfferTxn =
        await ideaMarketplaceContract.auctionEnd(auctionId);
      const receipt = await acceptOfferTxn.wait();

      const { transactionHash, from, to } = receipt;

      // ********************** Update NFT Table **************************
      const nft = await NFT.findOne({ tokenId: auctionId });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const updatedData = {
        isListed: false,
        onAuction: false,
        maticPrice: null,
        usdPrice: null,
        owner: bidOwnerId,
        expiryDate: null,
        auctionStartTime: null,
        event: NFT_EVENTS.ACCEPT,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      // ********************** nftActivity Table update *******************
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.ACCEPT,
        price: null,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      // ********************** BID Table update **************************
      const bidCount = await mongoose
        .model(MODALS.BID)
        .countDocuments({ tokenId: nft._id });
      if (bidCount >= 1) {
        await mongoose.model(MODALS.BID).deleteMany({ tokenId: nft._id });
      }

      // ********************** APPLICATION Table update **************************
      if (nft.invention) {
        await mongoose
          .model(MODALS.APPLICATION)
          .findOneAndUpdate(
            { _id: nft.invention },
            { owner: bidOwnerId },
            { upsert: false },
          );
      }
      const user = await mongoose.model(MODALS.PROFILE).findOne({
        _id: bidOwnerId,
        walletAddress: {
          $ne: '',
          $exists: true,
          $type: 'string',
        },
      });
      await blockchainController.distributeIdeaRewards(user?.walletAddress, 2);
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

      const privateKey = await getPrivateKeyForWalletAddress(
        req.user.id,
        walletAddress,
      );
      const signer = new ethers.Wallet(privateKey, provider);

      // Verify only the highest bidder can claim
      const ideaMarketplaceContractRead = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        provider,
      );
      const auctionData = await ideaMarketplaceContractRead.auction(auctionId);
      const highestBidderAddress = auctionData.currentBidder.toLowerCase();
      const claimerAddress = signer.address.toLowerCase();

      if (claimerAddress !== highestBidderAddress) {
        return res.status(403).json({
          success: false,
          error: 'Only the highest bidder can claim this NFT',
        });
      }

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer,
      );

      const claimNftTxn = await ideaMarketplaceContract.claimNft(auctionId);
      const receipt = await claimNftTxn.wait();

      const { transactionHash, from, to } = receipt;

      // ********************** Update NFT Table **************************
      const nft = await NFT.findOne({ tokenId: auctionId });

      if (!nft) {
        return res.status(404).json({ error: ERRORS.NFT_NOT_FOUND });
      }

      const updatedData = {
        isListed: false,
        onAuction: false,
        maticPrice: null,
        usdPrice: null,
        owner: req.user.id,
        expiryDate: null,
        auctionStartTime: null,
        event: NFT_EVENTS.CLAIM,
      };

      await NFT.findByIdAndUpdate(nft._id, updatedData, { new: true });

      // ********************** nftActivity Table update *******************
      const activityData = {
        nft: nft._id,
        from: from,
        to: to,
        event: NFT_EVENTS.CLAIM,
        price: null,
        txHash: transactionHash,
      };

      await NftActivity.create(activityData);

      // ********************** BID Table update **************************
      const bidCount = await mongoose
        .model(MODALS.BID)
        .countDocuments({ tokenId: nft._id });
      if (bidCount >= 1) {
        await mongoose.model(MODALS.BID).deleteMany({ tokenId: nft._id });
      }

      // ********************** APPLICATION Table update **************************
      if (nft.invention) {
        await mongoose
          .model(MODALS.APPLICATION)
          .findOneAndUpdate(
            { _id: nft.invention },
            { owner: req.user.id },
            { upsert: false },
          );
      }
      await blockchainController.distributeIdeaRewards(
        req.user.walletAddress,
        2,
      );

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

module.exports = blockchainController;

nodeCron.schedule('*/5 * * * *', () => {
  console.log('Running monitorMaticBalance every 5 minutes');
  blockchainController.monitorMaticBalance();
});

nodeCron.schedule('0 0 * * *', async () => {
  console.log('Running daily MATIC reward distribution job...');
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
    console.log('MATIC reward distribution job failed:', err);
  }
});
