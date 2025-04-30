const mongoose = require('mongoose');
const { config } = require('dotenv');
const { ethers } = require('ethers');
const { resolve } = require('path');
const nodeCron = require('node-cron');
const emailService = require('../helpers/email');
const { RewardIteration } = require('../models/RewardIteration');
const { ERRORS, EVENTS, MODALS, COMMON, CHANNELS } = require('../consts/index');
const { queueDb, SEND_CLAIM_YOUR_REWARD_EMAIL } = require('../helpers/queueDb');
const pusher = require('../pusherConfig');

// Load environment variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = resolve(__dirname, `../../env/.env.${NODE_ENV}`);
config({ path: envPath });

// Initialize Ethereum provider, wallet, and contract
const {
  INFURA_URL: providerUrl,
  PRIVATE_KEY: privateKey,
  IDEACOIN_CONTRACT_ADDRESS: IdeaContractAddress,
  MATIC_CONTRACT_ADDRESS: maticContractAddress,
  MARKETPLACE_CONTRACT_ADDRESS: marketplaceContractAddress,
  NFT_CONTRACT_ADDRESS: nftContractAddress,
  CURRENCY,
  COINBASE_API_URL,
} = process.env;
const provider = new ethers.providers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const ideaCoinContract = new ethers.Contract(
  IdeaContractAddress,
  require('../contract/IdeaCoins.json'),
  wallet,
);
const maticContract = new ethers.Contract(
  maticContractAddress,
  require('../contract/MaticToken.json'),
  provider,
);

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
      if (ideaCoins > 0) {
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

async function updateUser(id, updateObj) {
  const query = { _id: id };
  try {
    const result = await mongoose
      .model(MODALS.PROFILE)
      .findOneAndUpdate(query, updateObj, { new: true });

    if (!result) {
      console.error(`Document with id ${id} not found`);
      return null;
    }
    return result;
  } catch (error) {
    console.error(`Error updating document with id ${id}:`, error);
    throw error;
  }
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

const fetchLivePrices = async () => {
  const url = COINBASE_API_URL;
  const currencies = ['USD', 'BTC', 'ETH'];

  try {
    const response = await fetch(`${url}?currency=${CURRENCY}`);
    const data = await response.json();
    const rates = data.data.rates;

    const results = {};
    currencies.forEach((currency) => {
      if (rates[currency]) {
        results[currency] = parseFloat(parseFloat(rates[currency]).toFixed(8));
      }
    });

    return results;
  } catch (error) {
    console.error(ERRORS.FETCHING_LIVE_PRICES, error.message);
  }
};

const formatBalance = (balance) => {
  return parseFloat(ethers.utils.formatUnits(balance, 18));
};

const convertMaticToCurrency = async (maticAmount) => {
  try {
    const prices = await fetchLivePrices();
    return {
      usd: maticAmount * prices.USD,
      btc: maticAmount * prices.BTC,
      eth: maticAmount * prices.ETH,
    };
  } catch (error) {
    console.error(ERRORS.FAILED_TO_CONVERT_MATIC, error);
  }
};

async function sendClaimYourRewardEmail(user, share) {
  try {
    const currencies = await convertMaticToCurrency(share);
    await emailService.sendClaimYourRewardEmail({
      email: user.email,
      recipientFirstName: user.firstName | user.username,
      user: user.firstName || user.username || user.email,
      userLinkUrl: `${process.env.CLIENT_HOST}/${COMMON.PROFILES}/${user.key}`,
      rewardAmount: share,
      amountUSD: currencies.usd,
      amountBTC: currencies.btc,
      amountETH: currencies.eth,
      mainImage: user?.files[0]?.url,
    });
  } catch (error) {
    console.log(ERRORS.MAIL_SENDING_ERROR, error.message);
  }
}

async function sendEmailViaQueue(user, share) {
  queueDb.addToQueue(SEND_CLAIM_YOUR_REWARD_EMAIL, { user, share });
  queueDb.createWorker(SEND_CLAIM_YOUR_REWARD_EMAIL, async (item) => {
    const { user, share } = item.data;
    await sendClaimYourRewardEmail(user, share);
  });
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
        rewardEvent.args.recipient,
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
        throw new Error(ERRORS.MATIC_INSUFFICIENT);
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
      const { tokenId } = req.body;
      if (!tokenId) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }
  
      const signer = new ethers.Wallet(req.user.privateKey, provider);

      const ideaNftContract = new ethers.Contract(
        nftContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer
      );

      const tx = await ideaNftContract.approve(
        marketplaceContractAddress,
        tokenId
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
      const { tokenId, listPrice } = req.body;
      if (!tokenId || !listPrice) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      const signer = new ethers.Wallet(req.user.privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer
      );
      
      const listNftTxn = await ideaMarketplaceContract.listNftForFixedPrice(
        tokenId,
        listPrice,
        nftContractAddress
      );

      const receipt = await listNftTxn.wait();

      const { transactionHash, from, to } = receipt;

      return res.json({
        success: true,
        message: COMMON.NFT_FIXED_LIST_SUCCESS,
        transactionHash,
        from,
        to
      });

    }catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.LIST_FIXED_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  cancelFixedTransaction : async (req, res) => {
    try {      
      const { tokenId } = req.body;
      if (!tokenId) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      const signer = new ethers.Wallet(req.user.privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer
      );

      const cancelFixedNftTxn = await ideaMarketplaceContract.cancelListingForFixedPrice(
        tokenId
      );

      const receipt = await cancelFixedNftTxn.wait();

      const { transactionHash, from, to } = receipt;

      return res.json({
        success: true,
        message: COMMON.NFT_FIXED_CANCEL_SUCCESS,
        transactionHash,
        from,
        to
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.CANCEL_FIXED_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  },

  buyFixedTransaction : async (req, res) => {
    try {      
      const { tokenId, priceOfNft } = req.body;
      if (!tokenId || !priceOfNft) {
        return res.status(400).json({ error: ERRORS.INVALID_PARAMETER });
      }

      const signer = new ethers.Wallet(req.user.privateKey, provider);

      const ideaMarketplaceContract = new ethers.Contract(
        marketplaceContractAddress,
        require('../contract/IdeaMarketplace.json'),
        signer
      );

      const buyTx = await ideaMarketplaceContract.buyFixedPriceNft(tokenId, {
        value: priceOfNft
      });

      const receipt = await buyTx.wait();

      const { transactionHash, from, to } = receipt;
      
      return res.json({
        success: true,
        message: COMMON.BUY_NFT_FIXED_SUCCESS,
        transactionHash,
        from,
        to
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: `${ERRORS.BUY_FIXED_TRANSACTION_FAILED}: ${e.message}`,
      });
    }
  }
};

module.exports = blockchainController;

nodeCron.schedule('*/5 * * * *', () => {
  console.log('Running monitorMaticBalance every 5 minutes');
  blockchainController.monitorMaticBalance();
});
