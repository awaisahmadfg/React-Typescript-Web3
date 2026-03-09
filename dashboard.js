const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/getDashboardStats', dashboardController.getDashboardStats);
router.get('/getTopInfluencers', dashboardController.getTopInfluencers);
router.get('/getInfluencers', dashboardController.getInfluencers);
router.get(
  '/getHomeLandingPageStats',
  dashboardController.getHomeLandingPageStats,
);
router.get(
  '/getComapniesLandingPageStats',
  dashboardController.getCompaniesLandingPageStats,
  '/getInfluencerLandingPageStats',
  dashboardController.getInfluencerLandingPageStats,
);
router.get(
  '/getHowItWorksLandingPageStats',
  dashboardController.getHowItWorksLandingPageStats,
);
router.get(
  '/getHowItWorksFooterLandingPageStats',
  dashboardController.getHowItWorksFooterLandingPageStats,
);

module.exports = router;
