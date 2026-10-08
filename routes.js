const router = require('express').Router();
const { addReqUser, extractUserFromJWT } = require('./middlewares');
const applicationController = require('./controllers/applicationController');
const challengeController = require('./controllers/challengeController');
const companyProductController = require('./controllers/companyProductController');
const contestController = require('./controllers/contestController');
const priorArtController = require('./controllers/priorArtController');
const problemController = require('./controllers/problemController');
const profileController = require('./controllers/profileController');
const searchController = require('./controllers/searchController');
const shareController = require('./controllers/shareController');
const solutionController = require('./controllers/solutionController');
const tagController = require('./controllers/tagController');
const quotationRequestController = require('./controllers/quotationRequestController');
const dashboardController = require('./controllers/dashboardController');

router.use(extractUserFromJWT);
router.use(addReqUser);

router.use('/activities', require('./routes/activities'));
router.use('/ai', require('./routes/ai'));
router.use('/anonymousUser', require('./routes/anonymousUser'));
router.use('/applications', require('./routes/applications'));
router.use('/auth', require('./routes/auth'));
router.use('/bookmarks', require('./routes/bookmarks'));
router.use('/campaign', require('./routes/campaign'));
router.use('/challenges', require('./routes/challenges'));
router.use('/chatbot', require('./routes/chatbot'));
router.use('/conversations', require('./routes/conversations'));
router.use('/company-products', require('./routes/companyProducts'));
router.use('/components', require('./routes/component'));
router.use('/contests', require('./routes/contests'));
router.use('/feeds', require('./routes/feeds'));
router.use('/generations', require('./routes/generations'));
router.use('/globalSearch', require('./routes/globalSearch'));
router.use('/influencers', require('./routes/influencers'));
router.use('/inventionOpportunity', require('./routes/inventionOpportunity'));
router.use('/manufacturerCompany', require('./routes/manufacturerCompany'));
router.use('/manufacturer', require('./routes/manufacturer'));
router.use('/marketplace', require('./routes/marketplace'));
router.use('/nftActivities', require('./routes/nftActivities'));
router.use('/nfts', require('./routes/nfts'));
router.use('/notification', require('./routes/notification'));
router.use('/payouts', require('./routes/payouts'));
router.use('/prior-arts', require('./routes/priorArt'));
router.use('/problems', require('./routes/problems'));
router.use('/productions', require('./routes/productions'));
router.use('/products', require('./routes/products'));
router.use('/invitations', require('./routes/invitations'));
router.use('/profiles', require('./routes/profiles'));
router.use('/crowdfundingCampaign', require('./routes/crowdfundingCampaign'));
router.use('/quotations', require('./routes/quotations'));
router.use('/requests', require('./routes/requests'));
router.use('/rewardhistory', require('./routes/rewardHistory'));
router.use('/rewardPools', require('./routes/rewardPools'));
router.use('/rewards', require('./routes/rewards'));
router.use('/royalties', require('./routes/royalties'));
router.use('/royaltyCoinRewards', require('./routes/royaltyCoinRewards'));
router.use('/ideaPointsRewards', require('./routes/ideaPointsRewards'));
router.use('/tokenomics', require('./routes/tokenomics'));
router.use('/landing', require('./routes/landing'));
router.use('/creator-applications', require('./routes/creatorApplications'));
router.use('/blog', require('./routes/blog'));
router.use('/scrapperCreditHistory', require('./routes/scrapperCreditHistory'));
router.use('/search', require('./routes/search'));
router.use('/share', require('./routes/share'));
router.use('/sign-documents', require('./routes/sign-documents'));
router.use('/socialauthkeys', require('./routes/socialAuthKey'));
router.use('/solutions', require('./routes/solutions'));
router.use('/subscriptions', require('./routes/subscriptions'));
router.use('/tags', require('./routes/tags'));
router.use('/terms', require('./routes/terms'));
router.use('/textToVideo', require('./routes/textToVideo'));
router.use('/transactions', require('./routes/transactions'));
router.use('/userAgreements', require('./routes/userAgreements'));
router.use('/usertags', require('./routes/usertags'));
router.use('/webhooks', require('./routes/webhooks'));
router.use('/widget', require('./routes/widget'));
router.use('/quotationRequests', require('./routes/quotationRequests'));
router.use(
  '/manufacturerSurveyResponse',
  require('./routes/manufacturerSurveyResponse'),
);
router.use('/shipping', require('./routes/shipping'));
router.use(
  '/manufacturerSurveyQuestions',
  require('./routes/manufacturerSurveyQuestions'),
);
router.use('/dashboard', require('./routes/dashboard'));
router.use('/blockchain', require('./routes/blockchain'));
router.use('/agent-mail', require('./routes/agentMail'));

module.exports = {
  router,
  searchController,
  problemController,
  solutionController,
  applicationController,
  companyProductController,
  shareController,
  priorArtController,
  contestController,
  challengeController,
  tagController,
  profileController,
  quotationRequestController,
  dashboardController,
};
