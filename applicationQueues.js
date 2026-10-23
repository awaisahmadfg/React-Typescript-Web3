/* eslint-disable */

const { ethers } = require('ethers');
const applicationHelper = require('../helpers/application');
const { MODALS, PAY_STATUS } = require('../consts');
const {
  GET_PDF_TEMPLATE,
  GENERATE_ADS_DOCUMENT,
  QUEUE_REWARD_DISTRIBUTE,
  CREATE_COMPONENT,
  QUEUE_PATENT_TOKEN_LAUNCH,
} = require('../helpers/queueDb');
const {
  profileDal,
  applicationDal,
  crowdfundingCampaignDal,
  contestDal,
} = require('../dal');
const { createWorker } = require('../workers');
const {
  handleComponentCreation,
  handleProductComponentCreation,
  handleSolutionComponentCreation,
  handleProductComponentRegeneration,
  handleSolutionComponentRegeneration,
  handleComponentRegeneration,
} = require('../helpers/components');
const {
  ideaCoinContract: royaltyCoinContract,
  usdtContract,
  usdtContractAddress,
  wallet,
  updateUser,
  notifyUsdtRoyaltyPaid,
} = require('../helpers/blockchain');
const { mongoose } = require('mongoose');
const { processPatentTokenLaunch } = require('./patentTokenLaunchWorker');
const { generateAndUploadAdsDocument } = require('../helpers/adsDocument');
const solutionSaleRewards = require('../services/solutionSaleRewards');
const pusher = require('../pusherConfig');

createWorker(GET_PDF_TEMPLATE, async (job) => {
  console.log('GET_PDF_TEMPLATE');
  const { userId, applicationId, title, messageTitle } = job.data;
  const user = await profileDal.getOne(userId);
  const req = {
    params: { id: applicationId, title, messageTitle },
    user,
  };
  await applicationHelper.getPdfTemplate(req);
});

createWorker(GENERATE_ADS_DOCUMENT, async (job) => {
  console.log('GENERATE_ADS_DOCUMENT');
  const { userId, applicationId } = job.data;
  const user = await profileDal.getOne(userId);
  const channel = userId ? `ads-doc-${userId}` : null;

  try {
    const application = await applicationDal.getOne(applicationId, user);
    if (!application) {
      throw new Error(`Application not found: ${applicationId}`);
    }

    let owner = {};
    try {
      owner = await profileDal.getOne(
        application?.owner ?? application?.createdBy,
        user,
      );
    } catch (ownerErr) {
      console.warn(
        `GENERATE_ADS_DOCUMENT: failed to load owner for ${applicationId}:`,
        ownerErr?.message || ownerErr,
      );
    }

    const { adsDocUrl } = await generateAndUploadAdsDocument(
      application,
      owner,
    );

    await applicationDal.update(
      applicationId,
      {
        adsDocUrl,
        generatingAdsDocument: false,
      },
      user,
    );

    if (channel) {
      pusher.trigger(channel, 'ads-ready', {
        applicationId,
        adsDocUrl,
        message: 'ADS document generated successfully.',
      });
    }
  } catch (error) {
    console.error(
      `GENERATE_ADS_DOCUMENT failed for application ${applicationId}:`,
      error,
    );
    try {
      if (user) {
        await applicationDal.update(
          applicationId,
          { generatingAdsDocument: false },
          user,
        );
      }
    } catch (updateErr) {
      console.error(
        `Failed to clear generatingAdsDocument for ${applicationId}:`,
        updateErr,
      );
    }
    if (channel) {
      pusher.trigger(channel, 'ads-ready', {
        applicationId,
        error: true,
        message: `ADS document generation failed: ${error?.message || error}`,
      });
    }
    throw error;
  }
});

createWorker(CREATE_COMPONENT, async (job) => {
  switch (job.data.type) {
    case 'component':
      console.log('CREATE_COMPONENT-COMPONENT');
      if (job.data.regenerateComponentIds?.length) {
        console.log('CREATE_COMPONENT-COMPONENT-REGENERATE');
        await handleComponentRegeneration(job.data);
      } else {
        console.log('CREATE_COMPONENT-COMPONENT-CREATE');
        await handleComponentCreation(job.data);
      }
      return;
    case 'product':
      console.log('CREATE_COMPONENT-PRODUCT');
      if (job.data.proposeNewComponent) {
        console.log('CREATE_COMPONENT-PRODUCT-REGENERATE');
        await handleProductComponentRegeneration(job.data);
      } else {
        await handleProductComponentCreation(job.data);
      }
      return;
    case 'solution':
      console.log('CREATE_COMPONENT-SOLUTION');
      if (job.data.proposeNewComponent) {
        console.log('CREATE_COMPONENT-SOLUTION-REGENERATE');
        await handleSolutionComponentRegeneration(job.data);
      } else {
        await handleSolutionComponentCreation(job.data);
      }
      return;
    case 'application':
      console.log('CREATE_COMPONENT-APPLICATION');
      const {
        concept,
        user,
        creditsHistory,
        newSolutionIds,
        regenerateComponentIds,
        improvementText,
      } = job.data;
      await applicationDal._createComponents(
        concept,
        user,
        creditsHistory,
        newSolutionIds,
        regenerateComponentIds,
        improvementText,
      );
      return;
    default:
      console.log('CREATE_COMPONENT: Unknown type', job.data.type);
      return;
  }
});

createWorker(
  QUEUE_REWARD_DISTRIBUTE,
  async (job) => {
    switch (job.data.type) {
      case 'crowdfunding': {
        console.log('QUEUE_REWARD_DISTRIBUTE-CROWDFUNDING');
        const { rewardId, userId, walletAddress, share } = job.data;
        const History = mongoose.model(MODALS.REWARD_DISTRIBUTION_HISTORY);
        const reserved = await History.findOneAndUpdate(
          { _id: rewardId, status: PAY_STATUS.PENDING },
          { $set: { status: PAY_STATUS.PREPARE } },
          { new: true },
        );
        if (!reserved) {
          console.warn(
            `Reward ${rewardId} is not pending (already paid or in progress), skipping...`,
          );
          return;
        }

        let completed = false;
        try {
          const numericShare = Number(share);
          if (!Number.isFinite(numericShare) || numericShare <= 0) {
            console.warn(`Invalid share value for user ${userId}: ${share}`);
            return;
          }

          const normalizedShare = numericShare.toFixed(6);
          const usdtAmount = ethers.utils.parseUnits(normalizedShare, 6);

          if (usdtAmount.lte(0)) {
            console.warn(`Invalid amount for user ${userId}: ${share}`);
            return;
          }

          const royaltyBalance =
            await royaltyCoinContract.balanceOf(walletAddress);
          if (royaltyBalance.eq(0)) {
            console.warn(`User ${userId} has 0 RoyaltyCoins, skipping...`);
            return;
          }

          const ownerUsdtBalance = await usdtContract.balanceOf(wallet.address);
          if (usdtAmount.gte(ownerUsdtBalance)) {
            console.warn('Insufficient USDT in contract wallet, skipping...');
            return;
          }

          const txApprove = await usdtContract
            .connect(wallet)
            .approve(royaltyCoinContract.address, usdtAmount);
          await txApprove.wait();

          const tx = await royaltyCoinContract.distributeUsdtReward(
            walletAddress,
            usdtAmount,
            usdtContractAddress,
          );
          const receipt = await tx.wait();
          const transactionHash =
            receipt?.transactionHash || receipt?.hash || tx?.hash;

          await Promise.all([
            updateUser(userId, { $inc: { share: -numericShare } }),
            History.findByIdAndUpdate(
              rewardId,
              { status: PAY_STATUS.PAYED },
              { upsert: false },
            ),
          ]);

          const paidUsdtAmount = ethers.utils.formatUnits(usdtAmount, 6);
          await notifyUsdtRoyaltyPaid(
            userId,
            paidUsdtAmount,
            transactionHash,
            walletAddress,
          );

          completed = true;
        } catch (err) {
          console.error(
            `Error processing reward ${rewardId} for user ${userId}: ${err.message}`,
          );
        } finally {
          if (!completed) {
            await History.findOneAndUpdate(
              { _id: rewardId, status: PAY_STATUS.PREPARE },
              { $set: { status: PAY_STATUS.PENDING } },
            );
          }
        }
        return;
      }
      case 'distribute':
        console.log('QUEUE_REWARD_DISTRIBUTE-DISTRIBUTE');
        await crowdfundingCampaignDal.distributeRewardsToStakers(job.data);
        await crowdfundingCampaignDal.distributeRewardsToInfluencer(
          job.data.stakerId,
          job.data.appId,
          {
            stakers: [
              {
                id: job.data.stakerId,
                numberOfStake: job.data.numberOfStake,
              },
            ],
            jackpotPricePerUnit: job.data.jackpot,
          },
        );
        return;
      case 'idea_reward':
        console.log('QUEUE_REWARD_DISTRIBUTE-IDEA_REWARD');
        await contestDal.processIdeaReward(job.data);
        return;
      case 'solution_sale_reward': {
        console.log('QUEUE_REWARD_DISTRIBUTE-SOLUTION_SALE_REWARD');
        const { nftId, txHash, buyerProfileId, sellerProfileId, hasRevenue } =
          job.data;
        if (!nftId || !txHash) {
          console.warn('solution_sale_reward: missing nftId or txHash');
          return;
        }
        const nft = await mongoose
          .model(MODALS.NFT)
          .findById(String(nftId))
          .lean();
        if (!nft) {
          console.warn(`solution_sale_reward: NFT not found ${nftId}`);
          return;
        }
        await solutionSaleRewards.recordSolutionSaleRewards({
          nft,
          txHash,
          buyerProfileId,
          sellerProfileId,
          hasRevenue: Boolean(hasRevenue),
          logPrefix: '[solution_sale_reward]',
        });
        return;
      }
      case 'reward':
        console.log('QUEUE_REWARD_DISTRIBUTE-REWARD');
        contestDal.giveReward(job.data);
        return;
      default:
        console.log('QUEUE_REWARD_DISTRIBUTE: Unknown type', job.data.type);
        return;
    }
  },
  1,
);

createWorker(QUEUE_PATENT_TOKEN_LAUNCH, processPatentTokenLaunch, 1);

console.info('Application queuing workers bootstrapped');
