const mongoose = require('mongoose');
const { ethers } = require('ethers');
const { errors } = require('../helpers/errors');
const { parseQueryParam } = require('../helpers/utils');
const {
  getTopCompany,
  getTopInvention,
  getTopSolution,
  getTopContest,
  getTopInfluencers,
  getTopUsedSolution,
  getTopProfile,
  getTotals,
} = require('../services/dashboardService');
const {
  usdtContract,
  wallet,
  ideaCoinContract,
} = require('../helpers/blockchain');

const dashboardController = {};
const SIX_DECIMALS = 6;

dashboardController.getDashboardStats = async (req, res) => {
  try {
    const [
      topCompany,
      topInvention,
      topSolution,
      topContest,
      topInfluencers,
      topUsedSolution,
      topProfile,
      totals,
    ] = await Promise.all([
      getTopCompany(),
      getTopInvention(),
      getTopSolution(),
      getTopContest(),
      getTopInfluencers(),
      getTopUsedSolution(),
      getTopProfile(),
      getTotals(),
    ]);

    const data = {
      companyWithMostFollowers: topCompany,
      topInventionStaking: topInvention,
      solutionWithMostLikes: topSolution,
      contestWithMostParticipants: topContest,
      topInfluencers,
      topUsedSolution,
      topProfile,
      ...totals,
    };

    return res.json(data);
  } catch (error) {
    const message = 'Failed to fetch dashboard stats.';
    errors.handleError(res, error, message);
  }
};

dashboardController.getTopInfluencers = async (req, res) => {
  const range = parseQueryParam(req.query, 'range');
  const topInfluencers = await getTopInfluencers(range);

  // Count only influencers who have campaigns
  const totalInfluencers = await mongoose
    .model('Campaign')
    .distinct('influencerId')
    .then((ids) => ids.length);

  res.json({ data: topInfluencers, total: totalInfluencers });
};

dashboardController.getInfluencers = async (req, res) => {
  try {
    // Fetch top 3 influencers by followers
    const topInfluencers = await mongoose
      .model('InfluencerInfo')
      .find({})
      .sort({ followers: -1 })
      .limit(3)
      .select({
        name: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        profilePhoto: 1,
        followers: 1,
        headline: 1,
        location: 1,
        type: 1,
      })
      .lean();

    // Total influencer count
    const totalInfluencers = await mongoose
      .model('InfluencerInfo')
      .countDocuments();

    return res.json({
      data: topInfluencers,
      total: totalInfluencers,
    });
  } catch (error) {
    const message = 'Failed to fetch top influencers.';
    errors.handleError(res, error, message);
  }
};

dashboardController.getHomeLandingPageStats = async (req, res) => {
  try {
    const Profile = mongoose.model('Profile');
    const Problem = mongoose.model('Problem');
    const Solution = mongoose.model('Solution');
    const Tag = mongoose.model('Tag');
    const Application = mongoose.model('Application');

    const [
      totalUsers,
      profileIdeaPoints,
      problemIdeaPoints,
      solutionIdeaPoints,
      tagIdeaPoints,
      totalCompanies,
      totalFiledApplications,
      totalWorkplaceTags,
    ] = await Promise.all([
      // Total registered users
      Profile.countDocuments(),

      // Sum of ideaPoints from Profiles
      Profile.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      // Sum of ideaPoints from Problems
      Problem.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      // Sum of ideaPoints from Solutions
      Solution.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      // Sum of ideaPoints from Tags (companies/workplaces)
      Tag.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      // Total companies (Tags with type 'workplace')
      Tag.countDocuments({ type: 'workplace' }),

      // Applications where isFiled is true
      Application.countDocuments({ isFiled: true }),

      // Number of tags with type 'workplace'
      Tag.countDocuments({ type: 'workplace' }),
    ]);

    const totalIdeaPoints =
      (profileIdeaPoints[0]?.total ?? 0) +
      (problemIdeaPoints[0]?.total ?? 0) +
      (solutionIdeaPoints[0]?.total ?? 0) +
      (tagIdeaPoints[0]?.total ?? 0);

    const data = {
      totalUsers,
      totalIdeaPoints,
      totalCompanies,
      totalFiledApplications,
      totalWorkplaceTags,
    };

    return res.json(data);
  } catch (error) {
    const message = 'Failed to fetch home landing page stats.';
    errors.handleError(res, error, message);
  }
};

dashboardController.getCompaniesLandingPageStats = async (req, res) => {
  try {
    const Tag = mongoose.model('Tag');
    const Application = mongoose.model('Application');

    const [totalCompanies, totalApplications, totalFiledApplications] =
      await Promise.all([
        // Total companies (Tags with type 'workplace')
        Tag.countDocuments({ type: 'workplace' }),

        // Total Applications
        Application.countDocuments(),

        // Applications where isFiled is true
        Application.countDocuments({ isFiled: true }),
      ]);

    const data = {
      totalCompanies,
      totalApplications,
      totalFiledApplications,
    };

    return res.json(data);
  } catch (error) {
    const message = 'Failed to fetch home landing page stats.';
    errors.handleError(res, error, message);
  }
};

dashboardController.getInfluencerLandingPageStats = async (req, res) => {
  try {
    const [ownerUsdtBalanceRaw, totalRewardsRaw, decimals] = await Promise.all([
      usdtContract.balanceOf(wallet.address),
      ideaCoinContract.totalRewardsDistributed(),
      ideaCoinContract.decimals(),
    ]);

    const ownerUsdtBalance = parseFloat(
      ethers.utils.formatUnits(ownerUsdtBalanceRaw, SIX_DECIMALS),
    );

    const royaltyCoinsDistributed = parseFloat(
      ethers.utils.formatUnits(totalRewardsRaw, decimals),
    );

    return res.json({
      currentUsdcPool: ownerUsdtBalance,
      royaltyCoinsDistributed,
    });
  } catch (error) {
    const message = 'Failed to fetch influencer landing page stats.';
    errors.handleError(res, error, message);
  }
};

dashboardController.getHowItWorksLandingPageStats = async (req, res) => {
  try {
    const Profile = mongoose.model('Profile');
    const Solution = mongoose.model('Solution');

    const [totalUsers, totalSolutions] = await Promise.all([
      // Total Users
      Profile.countDocuments({
        roles: 'standard user',
        $or: [{ isAiGenerated: false }, { isAiGenerated: { $exists: false } }],
      }),

      // Total solutions
      Solution.countDocuments({ isAiGenerated: false }),
    ]);

    const data = {
      totalUsers,
      totalSolutions,
    };

    return res.json(data);
  } catch (error) {
    const message = 'Failed to fetch home landing page stats.';
    errors.handleError(res, error, message);
  }
};

dashboardController.getHowItWorksFooterLandingPageStats = async (req, res) => {
  try {
    const Solution = mongoose.model('Solution');
    const Application = mongoose.model('Application');
    const Profile = mongoose.model('Profile');
    const Problem = mongoose.model('Problem');
    const Tag = mongoose.model('Tag');

    const [
      totalFiledApplications,
      profileIdeaPoints,
      problemIdeaPoints,
      solutionIdeaPoints,
      tagIdeaPoints,
      totalSolutions,
    ] = await Promise.all([
      Application.countDocuments({ isFiled: true }),

      // Sum of ideaPoints from Profiles
      Profile.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      // Sum of ideaPoints from Problems
      Problem.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      // Sum of ideaPoints from Solutions
      Solution.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      // Sum of ideaPoints from Tags (companies/workplaces)
      Tag.aggregate([
        { $group: { _id: null, total: { $sum: '$ideaPoints' } } },
      ]),

      Solution.countDocuments({ isAiGenerated: false }),
    ]);

    const totalIdeaPoints =
      (profileIdeaPoints[0]?.total ?? 0) +
      (problemIdeaPoints[0]?.total ?? 0) +
      (solutionIdeaPoints[0]?.total ?? 0) +
      (tagIdeaPoints[0]?.total ?? 0);

    const data = {
      totalFiledApplications,
      totalIdeaPoints,
      totalSolutions,
    };

    return res.json(data);
  } catch (error) {
    const message = 'Failed to fetch home landing page stats.';
    errors.handleError(res, error, message);
  }
};

module.exports = dashboardController;
