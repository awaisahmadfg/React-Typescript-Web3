/* eslint-disable no-await-in-loop */
/* eslint-disable  */
const mongoose = require('mongoose');
const { MODALS } = require('../consts');
const blockchainController = require('../controllers/blockchainController');
const { getPk } = require('../helpers/utils');

const royaltyCoinRewardService = {};

royaltyCoinRewardService.getPendingRewardsByTag = async () => {
  const pendingRewards = await mongoose
    .model(MODALS.ROYALTY_COIN_REWARDS)
    .find({ status: 'pending' });

  if (!pendingRewards || pendingRewards.length === 0) {
    return null;
  }

  // Group rewards by rewardedEntity (tagId) and sum amounts
  const rewardsByTag = {};
  for (const reward of pendingRewards) {
    const tagId = reward.rewardedEntity.toString();
    if (!rewardsByTag[tagId]) {
      rewardsByTag[tagId] = {
        totalAmount: 0,
        rewardIds: [],
      };
    }
    rewardsByTag[tagId].totalAmount += reward.amount;
    rewardsByTag[tagId].rewardIds.push(reward._id);
  }

  return rewardsByTag;
};

royaltyCoinRewardService.getTagInfluencers = async (tagId) => {
  const tag = await mongoose.model(MODALS.TAG).findById(tagId);

  if (!tag) {
    throw new Error(`Tag not found: ${tagId}`);
  }

  const influencers = tag.members.filter(
    (member) => member.role === 'influencer',
  );

  return {
    tag,
    influencers,
  };
};

royaltyCoinRewardService.getInfluencerProfile = async (influencer) => {
  const profile = await mongoose
    .model(MODALS.PROFILE)
    .findById(getPk(influencer.profile));

  if (!profile) {
    throw new Error(`Profile not found for influencer: ${influencer.profile}`);
  }

  if (!profile.walletAddress) {
    throw new Error(
      `No wallet address for influencer: ${profile.email || influencer.profile}`,
    );
  }

  return profile;
};

royaltyCoinRewardService.distributeToInfluencer = async (profile, amount) => {
  const result = await blockchainController.distributeIdeaRewards(
    profile.walletAddress,
    amount,
  );

  return {
    success: true,
    profile,
    amount,
    result,
  };
};

royaltyCoinRewardService.markRewardsAsPaid = async (rewardIds) => {
  await mongoose
    .model(MODALS.ROYALTY_COIN_REWARDS)
    .updateMany({ _id: { $in: rewardIds } }, { status: 'paid' });
};

royaltyCoinRewardService.markRewardsAsFailed = async (rewardIds) => {
  await mongoose
    .model(MODALS.ROYALTY_COIN_REWARDS)
    .updateMany({ _id: { $in: rewardIds } }, { status: 'failed' });
};

royaltyCoinRewardService.markRewardsAsUnclaimed = async (rewardIds) => {
  await mongoose
    .model(MODALS.ROYALTY_COIN_REWARDS)
    .updateMany({ _id: { $in: rewardIds } }, { status: 'unclaimed' });
};

royaltyCoinRewardService.processTagRewards = async (tagId, rewardData) => {
  try {
    // Get tag and influencers
    const { tag, influencers } =
      await royaltyCoinRewardService.getTagInfluencers(tagId);

    if (!influencers || influencers.length === 0) {
      console.log(`No influencers found for tag: ${tag.name || tagId}`);

      // Mark rewards as unclaimed since there are no recipients
      await royaltyCoinRewardService.markRewardsAsUnclaimed(
        rewardData.rewardIds,
      );

      console.log(`Marked reward for ${tag?.name} as unclaimed`);

      return {
        success: false,
        reason: 'no_influencers',
        tagName: tag.name || tagId,
        rewardsMarkedUnclaimed: rewardData.rewardIds.length,
      };
    }

    console.log(
      `Distributing ${rewardData.totalAmount} coins to ${influencers.length} influencers for tag: ${tag.name || tagId}`,
    );

    // Calculate amount per influencer
    const amountPerInfluencer = rewardData.totalAmount / influencers.length;

    const distributionResults = [];

    // Distribute to each influencer
    for (const influencer of influencers) {
      try {
        const profile =
          await royaltyCoinRewardService.getInfluencerProfile(influencer);
        const result = await royaltyCoinRewardService.distributeToInfluencer(
          profile,
          amountPerInfluencer,
        );

        distributionResults.push(result);

        console.log(
          `Distributed ${amountPerInfluencer} coins to ${profile.email || profile.walletAddress}`,
        );
      } catch (influencerError) {
        console.error(
          `Error distributing to influencer ${influencer.profile}:`,
          influencerError.message,
        );
        distributionResults.push({
          success: false,
          error: influencerError.message,
          influencerId: getPk(influencer),
        });
      }
    }

    await royaltyCoinRewardService.markRewardsAsPaid(rewardData.rewardIds);

    console.log(`Marked ${rewardData.rewardIds.length} rewards as paid`);

    return {
      success: true,
      tagId,
      tagName: tag.name || tagId,
      influencersCount: influencers.length,
      amountPerInfluencer,
      distributionResults,
      rewardsMarkedPaid: rewardData.rewardIds.length,
    };
  } catch (tagError) {
    console.error(`Error processing tag ${tagId}:`, tagError.message);

    // Mark rewards as failed
    await royaltyCoinRewardService.markRewardsAsFailed(rewardData.rewardIds);

    return {
      success: false,
      tagId,
      error: tagError.message,
      rewardsMarkedFailed: rewardData.rewardIds.length,
    };
  }
};

// Main function to distribute monthly rewards
royaltyCoinRewardService.distributeMonthlyRewards = async () => {
  console.log('Running monthly royalty coin distribution job...');

  try {
    // Get all pending rewards grouped by tag
    const rewardsByTag =
      await royaltyCoinRewardService.getPendingRewardsByTag();

    if (!rewardsByTag) {
      console.log('No pending rewards to distribute');
      return {
        success: true,
        message: 'No pending rewards to distribute',
        processedTags: 0,
      };
    }

    console.log(
      `Found ${Object.keys(rewardsByTag).length} tags with pending rewards`,
    );

    const results = [];

    // Process each tag
    for (const [tagId, rewardData] of Object.entries(rewardsByTag)) {
      const result = await royaltyCoinRewardService.processTagRewards(
        tagId,
        rewardData,
      );
      results.push(result);
    }

    const successfulTags = results.filter((r) => r.success).length;
    const failedTags = results.filter((r) => !r.success).length;

    console.log('Monthly royalty coin distribution completed');
    console.log(`Successful: ${successfulTags}, Failed: ${failedTags}`);

    return {
      success: true,
      message: 'Monthly distribution completed',
      totalTags: results.length,
      successfulTags,
      failedTags,
      results,
    };
  } catch (error) {
    console.error('Monthly royalty coin distribution failed:', error);
    return {
      success: false,
      error: error.message,
      message: 'Monthly distribution failed',
    };
  }
};

module.exports = royaltyCoinRewardService;
