const express = require('express');
const router = express.Router();
const { verifyRoles, checkAuthentication } = require('../middlewares');
const { COMMON } = require('../consts');
const blockchainController = require('../controllers/blockchainController');

router.use(checkAuthentication);

router.post(
  '/approveNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.nftApprovalTransaction,
);
router.post(
  '/listFixedNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.listFixedNftTransaction,
);
router.post(
  '/cancelFixedNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.cancelFixedTransaction,
);
router.post(
  '/buyFixedNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.buyFixedTransaction,
);
router.post(
  '/listAuctionNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.listAuctionNftTransaction,
);
router.post(
  '/cancelAuctionNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.cancelAuctionTransaction,
);
router.get(
  '/bidNft/:id',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.getHighestBidOffer,
);
router.post(
  '/bidNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.bidTransaction,
);
router.post(
  '/acceptOffer',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.acceptOfferTransaction,
);
router.post(
  '/claimNft',
  verifyRoles([COMMON.STANDARD_USER]),
  blockchainController.claimNftTransaction,
);

router.get(
  '/getLatestThreshold',
  verifyRoles([COMMON.ADMINS]),
  blockchainController.getRewardsPoolThreshold,
);

module.exports = router;
