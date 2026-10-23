/* eslint-disable no-console */
/* eslint-disable complexity */

const { createWorker } = require('../workers');
const { sendTagFollowEmail } = require('../helpers/activity');
const { sendUsdtRoyaltyPaidEmail } = require('../helpers/blockchain');
const { sendNewEmployeeEmail } = require('../helpers/tag');
const {
  QUEUE_TAG_FOLLOW_EMAIL,
  PRE_EXPIRED_CONCEPTS_DELETION_EMAIL,
  EXPIRED_CONCEPTS_DELETION_EMAIL,
  SEND_USDT_ROYALTY_PAID_EMAIL,
  QUEUE_NFT_EMAILS,
  QUEUE_MANUFACTURER_EMAIL,
  SEND_NEW_EMPLOYEE_EMAIL,
} = require('../helpers/queueDb');
const emailService = require('../helpers/email');
const goHighLevelService = require('../services/goHighLevelService');
const { inviteRepresentativeEmail } = require('../helpers/manufacturerCompany');

const {
  sendNftBidderEmail,
  sendNftBuyerEmail,
  sendNftSellerEmail,
  sendNftListingEmail,
  sendNftExpiryEmail,
} = require('../helpers/nft');

createWorker(QUEUE_TAG_FOLLOW_EMAIL, async (job) => {
  console.log('QUEUE_TAG_FOLLOW_EMAIL');
  const { emailData } = job.data;
  await sendTagFollowEmail(emailData);
});

createWorker(PRE_EXPIRED_CONCEPTS_DELETION_EMAIL, async (job) => {
  console.log('PRE_EXPIRED_CONCEPTS_DELETION_EMAIL');
  emailService.sendPreExpiredConceptDeletionEmail(job.data);
});

createWorker(EXPIRED_CONCEPTS_DELETION_EMAIL, async (job) => {
  console.log('EXPIRED_CONCEPTS_DELETION_EMAIL');
  emailService.sendExpiredConceptDeletionEmail(job.data);
});

createWorker(SEND_USDT_ROYALTY_PAID_EMAIL, async (job) => {
  console.log('SEND_USDT_ROYALTY_PAID_EMAIL');
  const { user, share, txHash, payoutWalletAddress } = job.data;
  await sendUsdtRoyaltyPaidEmail(user, share, txHash, payoutWalletAddress);
});

createWorker(QUEUE_NFT_EMAILS, async (job) => {
  switch (job.data.type) {
    case 'bidder':
      console.log('QUEUE_NFT_EMAILS-BIDDER');
      await sendNftBidderEmail(job.data);
      break;
    case 'buyer':
      console.log('QUEUE_NFT_EMAILS-BUYER');
      await sendNftBuyerEmail(job.data);
      break;
    case 'seller':
      console.log('QUEUE_NFT_EMAILS-SELLER');
      await sendNftSellerEmail(job.data);
      break;
    case 'listing':
      console.log('QUEUE_NFT_EMAILS-LISTING');
      await sendNftListingEmail(job.data);
      break;
    case 'expiry':
      console.log('QUEUE_NFT_EMAILS-EXPIRY');
      await sendNftExpiryEmail(job.data);
      break;
    default:
      console.log('QUEUE_NFT_EMAILS: Unknown type', job.data.type);
  }
});

createWorker(QUEUE_MANUFACTURER_EMAIL, async (job) => {
  const { user, application } = job.data;
  switch (job.data.type) {
    case 'acceptQuotation':
      console.log('QUEUE_MANUFACTURER_EMAIL-ACCEPT_QUOTATION');
      await emailService.sendAcceptQuotationEmail({
        email: user.email,
        recipientFirstName: user.username,
        username: user.firstName || user.username || user.email,
        user,
        application,
      });
      return;
    case 'updateContact':
      console.log('QUEUE_MANUFACTURER_EMAIL-UPDATE_CONTACT');
      try {
        const { email, firstName, lastName, manufacturer, updatedApplication } =
          job.data;
        const manufacturerHighleveleData = {
          email: email,
          firstName: firstName,
          lastName: lastName,
          customFields: [
            {
              id: `${process.env.CROWDFUNDING_MANUFACTURER}`,
              field_value: manufacturer?.username || '',
            },
            {
              id: `${process.env.MANUFACTURER_NAME}`,
              field_value: manufacturer?.username || '',
            },
            {
              id: `${process.env.INVENTION_NAME}`,
              field_value: `${updatedApplication?.title}` || '',
            },
          ],
        };
        await goHighLevelService.updateContact(
          manufacturer.contactId,
          manufacturerHighleveleData,
        );
      } catch (error) {
        console.error(error);
      }
      return;
    case 'campaignExpire':
      console.log('QUEUE_MANUFACTURER_EMAIL-CAMPAIGN_EXPIRE');
      await emailService.sendCampaignExpireEmail({
        email: user.email,
        recipientFirstName: user.username,
        username: user.firstName || user.username || user.email,
        websiteUrl: `${process.env.CLIENT_HOST}/profiles/${user.key}?currentTab=Inventions&inventionId=${application.id}`,
        user,
        application,
      });
      return;
    case 'manufacturerCampaignExpire':
      console.log('QUEUE_MANUFACTURER_EMAIL-MANUFACTURER_CAMPAIGN_EXPIRE');
      await emailService.sendManufacturerCampaignExpireEmail({
        email: user.email,
        recipientFirstName: user.username,
        username: user.firstName || user.username || user.email,
        websiteUrl: `${process.env.CLIENT_HOST}/profiles/${user.key}?currentTab=Inventions&inventionId=${application.id}`,
        user,
        application,
      });
      return;
    case 'newQuotation':
      console.log('QUEUE_MANUFACTURER_EMAIL-NEW_QUOTATION');
      await emailService.sendNewQuotationEmail({
        email: user.email,
        recipientFirstName: user.username,
        username: user.firstName || user.username || user.email,
        websiteUrl: `${process.env.CLIENT_HOST}/profiles/${user.key}?currentTab=Inventions&inventionId=${application.id}`,
        user,
        application,
      });
      return;
    default:
      console.log('QUEUE_MANUFACTURER_EMAIL: Unknown type', job.data.type);
      return;
  }
});

createWorker(SEND_NEW_EMPLOYEE_EMAIL, async (job) => {
  const { user, communityImage } = job.data;
  switch (job.data.type) {
    case 'employee':
      const { tag, communityManager, userKey } = job.data;
      console.log('SEND_NEW_EMPLOYEE_EMAIL-EMPLOYEE');
      await sendNewEmployeeEmail(
        user,
        tag,
        communityManager,
        userKey,
        communityImage,
      );
      return;
    case 'representative':
      const { manufacturerCompany, companyAdmin } = job.data;
      await inviteRepresentativeEmail(
        user,
        manufacturerCompany,
        companyAdmin,
        communityImage,
      );
      return;
    default:
      console.log('SEND_NEW_EMPLOYEE_EMAIL: Unknown type', job.data.type);
      return;
  }
});

console.info('Email queuing workers bootstrapped');
