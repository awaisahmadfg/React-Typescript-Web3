const router = require('express').Router();
const bodyParser = require('body-parser');
const multer = require('multer');
const passport = require('passport');
const upload = multer();
const { COMMON, ERRORS } = require('./consts');
const {
  addReqUser,
  checkCredits,
  jwtAuth,
  verifyRoles,
} = require('./middlewares');
const activityController = require('./controllers/activityController');
const aiController = require('./controllers/aiController');
const applicationController = require('./controllers/applicationController');
const applicationGroupController = require('./controllers/applicationGroupController');
const authController = require('./controllers/authController');
const billingAddressController = require('./controllers/billingAddressController');
const blockchainController = require('./controllers/blockchainController');
const challengeController = require('./controllers/challengeController');
const companyProductController = require('./controllers/companyProductController');
const componentController = require('./controllers/componentController');
const contactController = require('./controllers/contactController');
const contestController = require('./controllers/contestController');
const feedController = require('./controllers/feedController');
const generationController = require('./controllers/generationController');
const inventionOpportunityController = require('./controllers/inventionOpportunityController');
const inventionStakerController = require('./controllers/inventionStakerController');
const manufacturerCompanyController = require('./controllers/manufacturerCompanyController');
const notificationController = require('./controllers/notificationController');
const payOutController = require('./controllers/payOutController');
const priorArtController = require('./controllers/priorArtController');
const problemController = require('./controllers/problemController');
const productController = require('./controllers/productController');
const profileController = require('./controllers/profileController');
const quotationController = require('./controllers/quotationController');
const rewardController = require('./controllers/rewardController');
const rewardHistoryController = require('./controllers/rewardHistoryController');
const royaltyController = require('./controllers/royaltyController');
const scrapperCreditHistoryController = require('./controllers/scrapperCreditHistoryController');
const searchController = require('./controllers/searchController');
const shareController = require('./controllers/shareController');
const signDocumentController = require('./controllers/signDocumentController');
const socialauthkeyController = require('./controllers/socialauthkeyController');
const solutionController = require('./controllers/solutionController');
const stripeController = require('./controllers/stripeController');
const subscriptionController = require('./controllers/subscriptionController');
const tagController = require('./controllers/tagController');
const termController = require('./controllers/termController');
const textToVideoController = require('./controllers/textToVideoController');
const userAgreementController = require('./controllers/userAgreementController');
const userTagController = require('./controllers/userTagController');
const webhooksController = require('./controllers/webhooksController');
const widgetController = require('./controllers/widgetController');
const productionsController = require('./controllers/productionsController');
const requestController = require('./controllers/requestController');
const nftController = require('./controllers/nftController');
const nftActivityController = require('./controllers/nftActivityController');
const bidController = require('./controllers/bidController');

router.use(jwtAuth);
router.use(addReqUser);

router.post(
  '/approveNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.nftApprovalTransaction,
);

router.post(
  '/listFixedNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.listFixedNftTransaction,
)

router.post(
  '/cancelFixedNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.cancelFixedTransaction,
)

router.post(
  '/buyFixedNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.buyFixedTransaction,
)
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
};
