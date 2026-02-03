/* eslint-disable no-labels */
/* eslint-disable no-throw-literal */
/* eslint-disable no-empty */
/* eslint-disable no-console */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-unused-vars */
/* eslint-disable no-warning-comments */
/* eslint-disable require-unicode-regexp */
/* eslint-disable no-var */
/* eslint-disable prefer-const */
/* eslint-disable no-await-in-loop */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/* eslint-disable max-lines */

const { ethers } = require('ethers');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const nodeCron = require('node-cron');
const { createReport } = require('docx-templates');
const DocxMerger = require('docx-merger');
const {
  APPLICATION_PATHS,
  COMMON,
  CREDIT_ACTIONS,
  DEFAULT_AI_ANS_LENGTH,
  ERRORS,
  IDEAPOINTS,
  MODALS,
  QUOTATION_STATUS,
  SUCCESS_MESSAGES,
  TYPES,
  EMAIL_TYPES,
  GENERATION_TYPES,
  HTTP_STATUS,
  TAG_TYPES,
} = require('../consts');
const {
  applicationDal,
  billingAddressDal,
  companyProductDal,
  problemDal,
  productDal,
  profileDal,
  rewardDal,
  signDocumentDal,
  solutionDal,
  subscriptionDal,
  tagDal,
  termDal,
  contestDal,
  nftDal,
  nftActivityDal,
  royaltyCoinsRewardsDal,
} = require('../dal/index');
const { isAdmin, Profile } = require('../models/Profile');
const coinbase = require('../helpers/coinbase');
const eSign = require('../helpers/e-sign');
const ipFs = require('../helpers/ipfs');
const { getDecryptedPrivateKey } = require('../helpers/encryptionHooks');
const {
  handleItemsUpdate,
  handleProfileUpdate,
  handleItemsIdeaPointsUpdate,
  CalculateMultiplierIdeapoints,
  handleTagsUpdate,
} = require('../helpers/reward');
const { s3Files } = require('../helpers/s3files');
const {
  getImageFromStableDiffusion,
} = require('../helpers/stableDiffusionImageGen');
const emailService = require('../helpers/email');
const sitemap = require('../helpers/sitemap');
const { negativePrompt } = require('../helpers/prompts');
const { exportService } = require('../helpers/export');
const { marketplace } = require('../helpers/marketplace');
const { childLogger } = require('../helpers/logger');
const dateHelpers = require('../helpers/date');
const { pinItem, getPinnedItems } = require('../helpers/pinItem');
const { generationService } = require('../services/generationService');
const {
  errors,
  NotFound,
  Unauthorized,
  Forbidden,
  UnprocessableEntity,
} = require('../helpers/errors');
const {
  queueDb,
  GET_PDF_TEMPLATE,
  QUEUE_IMAGE_GENERATE_NAME,
  PRE_EXPIRED_CONCEPTS_DELETION_EMAIL,
  EXPIRED_CONCEPTS_DELETION_EMAIL,
  QUEUE_PATENT_TOKEN_LAUNCH,
} = require('../helpers/queueDb');
const { ObjectId } = require('mongodb');

const {
  activityItem,
  activityAction,
  EXCLUSIVE_CANCEL_TIME,
  FINALIZE_TYPE,
  PAY_STATUS,
  PAYMENT_STATUS,
  rewardResource,
  rewardType,
  ROYALTY_COIN_ACTIONS,
  SIGN_STATUS,
  signDocType,
  SUBSCRIPTION,
  termsTemplateType,
  filters,
} = require('../consts');
const pusher = require('../pusherConfig');
const {
  priorArtService,
  relatedTypes,
} = require('../services/priorArtService');
const {
  signAdminDocument,
  signClientDocument,
  addPatentFields,
} = require('../helpers/sign');
const stripe = require('../helpers/stripe');
const applicationHelper = require('../helpers/application');
const subscriptionHelper = require('../helpers/subscription');
const { handleNewNotification } = require('../helpers/notification');
const {
  updateCreditsHistory,
  triggerCreditsPusher,
  subtractCredits,
  isCompanyEmployeeOrOwner,
} = require('../helpers/credits');
const { createImagePrompt } = require('../helpers/promptGeneration');
const { Application } = require('../models/Application');
const email = require('../helpers/email');
const { goHighLevelService } = require('../services/goHighLevelService');
const { NFT } = require('../models/NFT');
const blockchainController = require('./blockchainController');
const { provider, wallet } = require('../helpers/blockchain');
const { parseQueryParam, getPk } = require('../helpers/utils');
const { generateText } = require('../helpers/googleGenAi');
const IdeaNftABI = require('../contract/IdeaNft.json');

// Need to move into a separate folder

const logger = childLogger('ApplicationController');

const SITEMAP_NAME = 'inventions-sitemap.xml';

nodeCron.schedule('10 0 * * *', () => {
  // refresh sitemap every day at 00:10
  sitemap.refresh(SITEMAP_NAME);
});

setTimeout(() => {
  // generate sitemap
  sitemap.refresh(SITEMAP_NAME);
}, 10000);

const redirects = {};
function getHost(req, forUI = false) {
  if (process.env.NODE_ENV === 'production') {
    return req.headers.origin || process.env.HOST;
  }
  return forUI ? 'http://localhost:3000' : 'http://localhost:8080';
}

const checkExclusivityExpire = async () => {
  const items = await applicationDal.getSharedNotBought();
  items.forEach((item) => {
    if (!item.finalizeTime) {
      return;
    }
    const diff =
      item.finalizeTime.getTime() + EXCLUSIVE_CANCEL_TIME - Date.now();
    const itemId = item.id;
    if (diff <= 0) {
      applicationHelper.removeAsExpiredApp(itemId);
    } else {
      const cancelDate = new Date(
        item.finalizeTime.getTime() + EXCLUSIVE_CANCEL_TIME,
      );
      nodeCron.schedule(applicationHelper.dateToCron(cancelDate), () => {
        applicationHelper.removeAsExpiredApp(itemId);
      });
    }
  });
};

/**
 * @typedef {object} ApplicationSignModel - application sign model
 * @property {object} application - application info
 * @property {string} application.title - application title
 * @property {string} application.body - application body
 * @property {object} owner - application owner
 * @property {string} owner.username - application owner user name
 * @property {string} owner.email - application owner email
 * @property {object} problem - application problem
 * @property {string} problem.title - application problem title
 * @property {string} problem.body - application problem body
 */

/**
 *
 * @param {Object} application
 * @param {Object} options
 * @param {Object} options.owner
 * @param {Object} options.problem
 * @param {Object} options.solutions
 * @param {Object} options.host
 * @returns {Promise<ApplicationSignModel>}
 */
async function getApplicationSignModel(application, options) {
  const { host = '', owner = {}, problem = {}, solutions = [] } = options || {};
  return {
    application: {
      title: application.title,
      body: application.body,
      link: `${host}/inventions/${application.key}`,
      fillingDate: dateHelpers.getDateStr(application.fillingTime),
      uspto: application.fillingPatentNumber,
    },
    owner: {
      firstName: owner.firstName,
      lastName: owner.lastName,
      username: owner.username,
      email: owner.email,
    },
    problem: {
      title: problem.title,
      body: problem.body,
    },
    solutions: {
      title: solutions
        .map((sol) => {
          return sol.title;
        })
        .join(', '),
      link: solutions
        .map((sol) => {
          return `${host}/solutions/${sol.key}`;
        })
        .join(', '),
    },
  };
}

// init timer check
setTimeout(() => {
  checkExclusivityExpire().catch((err) => {
    logger.error(err);
  });
}, 1000 * 10);

async function fetchConceptsByDate(criteriaDate, additionalQuery = {}) {
  try {
    const query = {
      createdAt: criteriaDate,
      $or: [{ isFiled: false }, { isFiled: { $exists: false } }],
      ...additionalQuery,
    };

    const applications = await Application.find(query);
    return applications;
  } catch (error) {
    console.error(ERRORS.FETCH_CONCEPTS_BY_DATE, error);
  }
}

async function fetchExpiredConcepts() {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const criteriaDate = { $lte: twelveMonthsAgo };
  return fetchConceptsByDate(criteriaDate);
}

async function fetchExpiringConcepts() {
  const now = new Date();
  const elevenMonthsAgo = new Date();
  elevenMonthsAgo.setMonth(now.getMonth() - 11);

  const startOfCreationDate = new Date(elevenMonthsAgo.setHours(0, 0, 0, 0));
  const endOfCreationDate = new Date(elevenMonthsAgo.setHours(23, 59, 59, 999));

  const criteriaDate = {
    $gte: startOfCreationDate,
    $lt: endOfCreationDate,
  };
  return fetchConceptsByDate(criteriaDate);
}

async function sendConceptDeletionEmails(concepts, emailType) {
  const conceptsByOwner = applicationHelper.getConceptsByOwner(concepts);

  // eslint-disable-next-line no-shadow
  for (const [ownerId, concepts] of Object.entries(conceptsByOwner)) {
    const owner = await Profile.findOne({ _id: ownerId });
    if (owner) {
      const emailData = {
        email: owner.email,
        recipientFirstName: owner.firstName || owner.username,
        user: owner.firstName || owner.username || owner.email,
        userLinkUrl: `${process.env.CLIENT_HOST}/${COMMON.PROFILES}/${owner.key}`,
      };

      if (emailType === EMAIL_TYPES.PRE_EXPIRED) {
        queueDb.addToQueue(PRE_EXPIRED_CONCEPTS_DELETION_EMAIL, {
          ...emailData,
          expiringConcepts: applicationHelper.formatExpiredConcepts(concepts),
        });
        // queueDb.createWorker(
        //   PRE_EXPIRED_CONCEPTS_DELETION_EMAIL,
        //   async (item) => {
        //     emailService.sendPreExpiredConceptDeletionEmail(item.data);
        //   },
        // );
      } else if (emailType === EMAIL_TYPES.EXPIRED) {
        queueDb.addToQueue(EXPIRED_CONCEPTS_DELETION_EMAIL, {
          ...emailData,
          deletedConcepts: applicationHelper.formatExpiredConcepts(concepts),
        });
        // queueDb.createWorker(EXPIRED_CONCEPTS_DELETION_EMAIL, async (item) => {
        //   emailService.sendExpiredConceptDeletionEmail(item.data);
        // });
      }
    }
  }
}

//noftify about concepts deletion, before 1 week.
async function notifyConceptsDeletion() {
  try {
    const expiringConcepts = await fetchExpiringConcepts();
    if (expiringConcepts.length > 0) {
      await sendConceptDeletionEmails(
        expiringConcepts,
        EMAIL_TYPES.PRE_EXPIRED,
      );
    }
  } catch (error) {
    console.error(ERRORS.FETCH_EXPIRING_CONCEPTS, error);
  }
}

// Function to delete non-filed expired concepts
async function deleteExpiredConcepts() {
  try {
    const expiredConcepts = await fetchExpiredConcepts();

    if (expiredConcepts.length > 0) {
      const expiredConceptsIds = expiredConcepts.map((concept) => concept._id);
      await Application.deleteMany({ _id: { $in: expiredConceptsIds } });

      await sendConceptDeletionEmails(expiredConcepts, EMAIL_TYPES.EXPIRED);
    }
  } catch (error) {
    console.error(ERRORS.DELETE_EXPIRED_CONCEPTS, error);
  }
}

// This job will every 24hrs.
nodeCron.schedule('0 0 * * *', () => {
  deleteExpiredConcepts();
  notifyConceptsDeletion();
});

const applicationController = {};

applicationController.getList = async (req, res) => {
  try {
    const sort = req?.query?.sort ? JSON.parse(req?.query?.sort) : null;
    const range = req?.query?.range ? JSON.parse(req?.query?.range) : null;
    const filter = req?.query?.filter ? JSON.parse(req?.query?.filter) : null;
    let user = req?.user;

    // if (!user) {
    //   user = await profileDal.getOne(filter?.owner);
    // }

    const populateFields = [
      {
        path: 'selected',
        model: 'Solution',
      },
      {
        path: 'problems',
        model: 'Problem',
      },
      {
        path: 'components',
        model: MODALS.COMPONENT,
      },
    ];

    const data = await applicationDal.getList({ sort, range, filter }, user);
    const total = await applicationDal.getCount({ filter }, user);
    const responseData = { data, total };

    if (
      filter &&
      filter?.$custom &&
      filter?.$custom?.category == 'profile' &&
      filter?.owner &&
      (range[0] == 0 || filter?.$custom?.getPinItems)
    ) {
      user = await profileDal.getOne(filter.owner);
      const pinnedItems = await getPinnedItems(
        'Application',
        user.id,
        populateFields,
        filter?.$custom?.isFiled,
        filter?.$custom?.isArchived,
      );
      responseData.pinnedItems = pinnedItems;
      responseData.updatePinItems = true;
    }

    if (responseData?.data[0]) {
      responseData.data[0].tags = responseData.data[0]?.tags || [];
      responseData.data[0].tagsInfo = responseData.data[0]?.tagsInfo || [];
      responseData?.data[0]?.problems.map((problem) => {
        problem?.tags?.map((tag) => {
          responseData?.data[0]?.tags.push(tag.id);
          responseData?.data[0]?.tagsInfo.push(tag);
        });
      });
    }

    res.json(responseData);
  } catch (error) {
    const message = 'Selecting applications error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getDocumentIndex = async (req, res) => {
  try {
    const query = req.query;
    const id = parseQueryParam(query, 'id');
    const sort = parseQueryParam(query, 'sort');
    const filter = parseQueryParam(query, 'filter');
    let user = req?.user;

    const index = await applicationDal.getDocumentIndex(
      { id, sort, filter },
      user,
    );
    res.json(index);
  } catch (error) {
    console.error(error);
    const message = 'Fetching document index error';
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(message);
  }
};

applicationController.getCount = async (req, res) => {
  try {
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const { owner, isPaid, isFiled } = filter;
    const count = await mongoose
      .model(MODALS.APPLICATION)
      .countDocuments({ isPaid, isFiled, owner });
    res.json(count);
  } catch (error) {
    errors.handleError(
      res,
      error,
      'Error while retrieving application count',
      logger,
    );
  }
};

applicationController.getOne = async (req, res) => {
  try {
    const data = await applicationDal.getOne(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    const message = 'Selecting application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.findBySolution = async (req, res) => {
  try {
    const { query, user } = req;
    const solutionId = parseQueryParam(query, 'solutionId');
    const ownerId = parseQueryParam(query, 'ownerId');
    const data = await applicationDal.findBySolution(solutionId, ownerId, user);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(error.message);
  }
};

applicationController.getOneByKey = async (req, res) => {
  try {
    const data = await applicationDal.getOneByKey(req.params.key, req.user);
    res.json(data);
  } catch (error) {
    const message = 'Selecting application by key error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getManyByFilter = async (req, res) => {
  try {
    const filter = req?.query?.filter ? JSON.parse(req?.query?.filter) : null;
    const data = await applicationDal.getManyByFilter(filter, req.user);
    res.json(data);
  } catch (error) {
    const message = 'Selecting application by key error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getTemplate = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const application = await applicationDal.getOne(req.params.id, req.user);
    if (!application) {
      throw new NotFound();
    }

    if (!isAdmin(req.user)) {
      const totalTemplates = req.user.downloadTemplates.length;
      const [stats, hasTemplate] = await Promise.all([
        profileDal.getStats(req.user.id, rewardDal),
        profileDal.hasDownloadedTemplate(req.user.id, application.id),
      ]);
      const isOwner = req.user.id.toString() === application.owner.toString();
      const canHaveTemplate = totalTemplates === 0 || stats.credits > 1;
      if (!isOwner || (!hasTemplate && !canHaveTemplate)) {
        throw new Forbidden();
      }
      if (!hasTemplate) {
        await profileDal.updateDownloadedTemplate(req.user.id, application.id);
      }
      if (totalTemplates !== 0) {
        await profileDal.updateCredits(req.user.id, 1, -1);
      }
    }

    if (application.parentApplication) {
      return applicationController.getImproveTemplate(application, req, res);
    }
    let owner = { username: '' };
    try {
      owner = await profileDal.getOne(application.owner, req.user);
    } catch (err) {
      logger.warn(`Can not get application owner: ${err.message}`);
    }
    const rootProblems = await problemDal.getTree(
      application.problems,
      application.selected,
      req.user,
    );

    let parentApplication;
    if (application.parentApplication) {
      parentApplication = await applicationDal.getOne(
        application.parentApplication,
        req.user,
      );
    }
    const templatePath = path.resolve(
      __dirname,
      '../templates/Application.docx',
    );
    const claimsTemplatePath = path.resolve(
      __dirname,
      '../templates/Claims.docx',
    );
    const figureTemplatePath = path.resolve(
      __dirname,
      '../templates/Figure.docx',
    );
    const template = fs.readFileSync(templatePath);
    const claimsTemplate = fs.readFileSync(claimsTemplatePath);
    const figureTemplate = fs.readFileSync(figureTemplatePath);
    let images = [];
    for (const item of rootProblems) {
      const file = applicationHelper.getFiles(item, undefined, undefined, {
        index: 0,
      });
      images.push(...file);
      await applicationHelper.loadFiles(file);
    }

    const mainDoc = await createReport({
      template,
      cmdDelimiter: ['{{', '}}'],
      data: {
        application,
        parentApplication: parentApplication || false,
        rootProblems,
        images,
        owner,
      },
    });
    const mainDocBuf = new Buffer(mainDoc, 'base64');
    const claimsDoc = await createReport({
      template: claimsTemplate,
      cmdDelimiter: ['{{', '}}'],
      data: {},
    });
    const claimsDocBuf = new Buffer(claimsDoc, 'base64');
    const imagesDocs = await Promise.all(
      images.map((image, index) => {
        return createReport({
          template: figureTemplate,
          cmdDelimiter: ['{{', '}}'],
          data: {
            image,
            index: index + 1,
            count: images.length,
          },
        });
      }),
    );
    const imagesDocsBuf = imagesDocs.map((doc) => new Buffer(doc, 'base64'));
    var docx = new DocxMerger({}, [mainDocBuf, claimsDocBuf, ...imagesDocsBuf]);

    docx.save('nodebuffer', function (data) {
      res.setHeader(
        'content-type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      res.setHeader(
        'content-disposition',
        'attachment; filename=Application.docx',
      );
      res.send(data);
    });
  } catch (error) {
    const message = 'Preparing application template error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getPdfTemplate = async (req, res) => {
  const { id } = req.params;
  const { user } = req;
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const { title } = req.query;
    const docTitle = title.match(/_(.*?)_/);
    const application = await applicationDal.getOneByKey(id, req.user);
    const hasComponents = application?.components?.length > 0;

    if (application && application.isDownloaded) {
      pusher.trigger(`patent-pdf-${user.id}`, 'pdf-ready', {
        applicationId: id,
        url: application.downloadUrl,
        title,
        message: `PDF already generated for: ${docTitle[1]}.`,
      });
      return res.json({
        message: 'PDF already exists for this application.',
      });
    }
    await applicationDal.update(
      req.params.id,
      {
        generatingPatentApplication: true,
        isCreatingComponents: !hasComponents,
      },
      req.user,
    );
    queueDb.addToQueue(GET_PDF_TEMPLATE, {
      userId: user.id,
      applicationId: id,
      title: title,
      messageTitle: docTitle[1],
    });
    pusher.trigger(`patent-pdf-${user.id}`, 'pdf-start', {
      title,
      message: `PDF generation started for: ${docTitle[1]}. You will be notified once it is complete.`,
    });
    return res.json({
      message:
        'PDF generation started. You will be notified once it is complete.',
    });
  } catch (error) {
    pusher.trigger(`patent-pdf-${user.id}`, 'pdf-ready', {
      applicationId: id,
      error: true,
      message: `Preparing PDF application data error: ${error}.`,
    });
  }
};

applicationController.getImproveTemplate = async (application, req, res) => {
  try {
    if (!isAdmin(req.user)) {
      throw new Forbidden('Only admins or lawyers');
    }

    const problems = await problemDal.getTree(
      application.problems,
      application.selected,
      req.user,
    );

    let rootProblems = [];
    let rootSolutions = [];
    for (const rootProblem of problems) {
      const rootItems = applicationHelper.prepareProblem(rootProblem);
      rootProblems.push(...rootItems.problems);
      rootSolutions.push(...rootItems.solutions);
    }

    const parentApplication = await applicationDal.getOne(
      application.parentApplication,
      req.user,
    );

    const parentProblems = await problemDal.getTree(
      parentApplication.problems,
      parentApplication.selected,
      req.user,
    );

    let rootParentProblems = [];
    for (const rootProblem of parentProblems) {
      rootParentProblems.push(
        ...applicationHelper.prepareProblem(rootProblem).problems,
      );
    }

    const owner = await profileDal.getOne(application.owner, req.user);

    const appImage = application.files && application.files[0];

    let imagesItems = rootSolutions;
    if (appImage) {
      imagesItems = [application, ...rootSolutions];
    }
    const images = applicationHelper.getFlatFiles(imagesItems);
    await applicationHelper.loadFiles(images);

    const templatePath = path.resolve(
      __dirname,
      '../templates/ApplicationImprovement.docx',
    );
    const claimsTemplatePath = path.resolve(
      __dirname,
      '../templates/Claims.docx',
    );
    const figureTemplatePath = path.resolve(
      __dirname,
      '../templates/Figure.docx',
    );
    const template = fs.readFileSync(templatePath);
    const claimsTemplate = fs.readFileSync(claimsTemplatePath);
    const figureTemplate = fs.readFileSync(figureTemplatePath);

    const mainDoc = await createReport({
      template,
      cmdDelimiter: ['{{', '}}'],
      data: {
        application,
        parentApplication,
        problems,
        rootProblems,
        rootSolutions,
        parentProblems,
        rootParentProblems,
        images,
        appImage: !!appImage,
        owner,
      },
    });
    const mainDocBuf = new Buffer(mainDoc, 'base64');
    const claimsDoc = await createReport({
      template: claimsTemplate,
      cmdDelimiter: ['{{', '}}'],
      data: {
        owner,
      },
    });
    const claimsDocBuf = new Buffer(claimsDoc, 'base64');
    const imagesDocs = await Promise.all(
      images.map((image, index) => {
        return createReport({
          template: figureTemplate,
          cmdDelimiter: ['{{', '}}'],
          data: {
            image,
            index: index + 1,
            count: images.length,
          },
        });
      }),
    );
    const imagesDocsBuf = imagesDocs.map((doc) => new Buffer(doc, 'base64'));
    var docx = new DocxMerger({}, [mainDocBuf, claimsDocBuf, ...imagesDocsBuf]);

    docx.save('nodebuffer', function (data) {
      res.setHeader(
        'content-type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      res.setHeader(
        'content-disposition',
        'attachment; filename=Application.docx',
      );
      res.send(data);
    });
  } catch (error) {
    const message = 'Preparing improve application template error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getNFTInfoTemplate = async (req, res) => {
  try {
    const id = req.params.id;
    const pdf = await exportService.getNFTInfoFile(id, req);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'attachment; filename=Exhibit_B.pdf');
    res.send(pdf);
  } catch (error) {
    const message = 'Preparing NFT info template application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getNFTInfoTemplateData = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const application = await applicationDal.getOne(req.params.id, req.user);
    if (!application) {
      throw new NotFound();
    }
    const {
      isExclusivityPaid,
      fillingPatentNumber,
      fillingPatentReceipt,
      fillingPatentReceiptId,
      fillingPatentReceiptParagraphs,
      fillingTime,
    } = application;

    let data = {
      isExclusivityPaid,
      fillingPatentNumber,
      fillingPatentReceipt,
      fillingPatentReceiptId,
      fillingPatentReceiptParagraphs,
      fillingTime,
    };

    res.send(data);
  } catch (error) {
    const message = 'Preparing NFT info template application data error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.vote = async (req, res) => {
  try {
    const data = await applicationDal.vote(
      req.params.id,
      req.body,
      req.user,
      req.query.filter ? JSON.parse(req.query.filter) : null,
    );
    res.json(data);
  } catch (error) {
    const message = 'Vote application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.checkImprovedProgress = async (req, res) => {
  try {
    const data = await applicationDal.checkImprovedProgress(req.params.id);
    res.json(data);
  } catch (error) {
    const message = ERRORS.ERROR_IN_CHECK_IMPROVED_PROGRESS;
    errors.handleError(res, error, message, logger);
  }
};

applicationController.copy = async (req, res) => {
  try {
    const data = await applicationDal.copy(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    const message = 'Copy application error';
    errors.handleError(res, error, message, logger);
  }
};

//TODO: Remove commented code in future.
applicationController.file = async (req, res) => {
  try {
    const applicationId = req.params.id;
    const application = await applicationDal.getOne(applicationId, {
      isSuper: true,
    });

    if (application) {
      const { recipientWalletAddress } =
        await getRecipientWalletAndBalance(application);

      const adminWalletAddress = wallet.address;
      const balance = await provider.getBalance(adminWalletAddress);

      const IdeaNftContract = new ethers.Contract(
        process.env.NFT_CONTRACT_ADDRESS,
        IdeaNftABI,
        wallet,
      );

      const contractOwner = await IdeaNftContract.owner();
      if (contractOwner.toLowerCase() !== adminWalletAddress.toLowerCase()) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          status: 'gas_estimation_failed',
          message: 'Admin wallet is not the contract owner',
        });
      }

      if (
        !recipientWalletAddress ||
        recipientWalletAddress === ethers.constants.AddressZero
      ) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          status: 'invalid_recipient',
          message: 'Invalid recipient wallet address',
        });
      }

      const dummyTokenURI = 'ipfs://dummy';
      let gasEstimate;
      try {
        gasEstimate = await IdeaNftContract.estimateGas.mintNFT(
          recipientWalletAddress,
          dummyTokenURI,
        );
      } catch (error) {
        logger.error('Gas estimation failed in file endpoint:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          status: 'gas_estimation_failed',
          message: 'Failed to estimate gas for transaction',
          error: error.message,
        });
      }

      const gasPrice = await provider.getGasPrice();
      const requiredGas = gasEstimate.mul(gasPrice);
      const requiredGasEth = parseFloat(ethers.utils.formatEther(requiredGas));
      const currentBalanceEth = parseFloat(ethers.utils.formatEther(balance));

      const requiredWithBuffer = requiredGas.mul(120).div(100);
      if (balance.lt(requiredWithBuffer)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          status: 'insufficient_funds',
          message:
            'Admin wallet has insufficient funds for gas. Please add funds before filing the patent.',
          requiredGasEth: requiredGasEth * 1.2,
          currentBalanceEth,
        });
      }

      if (balance.eq(0)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          status: 'zero_balance',
          message:
            'Admin wallet has zero balance. Please add funds before filing the patent.',
          currentBalanceEth: 0,
          requiredGasEth: requiredGasEth * 1.2,
        });
      }
    }

    const app = await applicationDal.file(req.params.id, req.body, req.user);
    const { number, sign = null, date, ipAddress } = req.body;

    // Upload the filing receipt to IPFS
    const [receiptId, receiptUrl] = await ipFs.upload({
      data: req.files[0]?.buffer,
      title: `Sign-${app.signerClientId}.pdf`,
    });

    let appUpdateObj = {
      isFiled: true,
      isPaid: true,
      fillingPatentNumber: number,
      fillingTime: String(date),
      fillingPatentReceipt: receiptId,
    };

    if (!app.fillingEnvelopeId) {
      // const [owner, problem, solutions] = await Promise.all([
      //   profileDal.getOne(app.owner).catch(() => undefined),
      //   problemDal.getOne(app.problem, req.user).catch(() => undefined),
      //   solutionDal.getFullList(app.selected).catch(() => undefined),
      // ]);

      //If the client has signed the aggreement doc, then it will add the patent number and date into it.
      //It will delete the original aggreement doc from pinata and create a new one.
      //Also updates the application document, add a new field `filingEnvelopeId` and `fillingSignerClientId`.
      if (app.signerClientId) {
        const signerClientId = new Date().getTime();

        //addPatentFields takes the aggreement doc and adds the patent number and date into it.
        const { clientDocPdfBytes } = await addPatentFields(
          number,
          date,
          app.envelopeId,
        );
        const [fileId, fileUrl] = await ipFs.upload({
          data: clientDocPdfBytes,
          title: `Sign-${app.signerClientId}.pdf`,
        });
        //delete previous client signed document
        await ipFs.delete(app.envelopeId);

        app.envelopeId = fileId;
        app.signedAgreementUrl = fileUrl;
        app.signerClientId = signerClientId;
        // await signDocumentDal.create({
        //   type: signDocType.APPLICATION_BUY,
        //   itemType: activityItem.APPLICATION,
        //   itemId: app.id,
        //   owner: app.owner,
        //   documentId: app.envelopeId,
        // });
        appUpdateObj = {
          ...appUpdateObj,
          fillingEnvelopeId: fileId,
          fillingSignerClientId: signerClientId,
        };
      }

      // if (sign) {
      // const signerClientId = new Date().getTime();
      // const { fileId, fileUrl } = await uploadAdminSignedDocument(
      //   number,
      //   sign,
      //   date,
      //   solutions,
      //   app,
      //   owner.username,
      //   signerClientId,
      //   ipAddress,
      // );
      // if (app.signerClientId) {
      //   //It takes the aggreement doc and adds the patent number and date into it.
      //   const { clientDocPdfBytes } = await addPatentFields(
      //     number,
      //     date,
      //     app.envelopeId,
      //   );
      //   const [fileId, fileUrl] = await ipFs.upload({
      //     data: clientDocPdfBytes,
      //     title: `Sign-${app.signerClientId}.pdf`,
      //   });
      //   //delete previous client signed document
      //   await ipFs.delete(app.envelopeId);

      //   app.envelopeId = fileId;
      //   app.signedAgreementUrl = fileUrl;
      //   app.signerClientId = signerClientId;
      //   await signDocumentDal.create({
      //     type: signDocType.APPLICATION_BUY,
      //     itemType: activityItem.APPLICATION,
      //     itemId: app.id,
      //     owner: app.owner,
      //     documentId: app.envelopeId,
      //   });
      //   console.log('Client document:', fileId, fileUrl);
      // }
      // const signDocument = await signDocumentDal.create({
      //   type: signDocType.APPLICATION_FILL,
      //   itemType: activityItem.APPLICATION,
      //   itemId: app.id,
      //   owner: app.owner,
      //   documentId: app.fillingEnvelopeId,
      // });
      // appUpdateObj = {
      //   ...appUpdateObj,
      //   fillingEnvelopeId: fileId,
      //   fillingSignerClientId: signerClientId,
      //   fillingSignDocumentId: signDocument.id,
      // };
      // }

      const response = await applicationDal.updateInternal(
        req.params.id,
        appUpdateObj,
      );

      if (response.isFiled) {
        try {
          const { recipientWalletAddress } =
            await getRecipientWalletAndBalance(response);

          const updateResult = await mongoose
            .model(MODALS.APPLICATION)
            .findOneAndUpdate(
              {
                _id: applicationId,
                $or: [
                  { deployingStatus: { $exists: false } },
                  { deployingStatus: 'not_deployed' },
                  { deployingStatus: null },
                ],
              },
              {
                $set: {
                  deployingStatus: 'deploying',
                },
              },
              { new: true },
            );

          if (updateResult) {
            await queueDb.queues[QUEUE_PATENT_TOKEN_LAUNCH].add(
              QUEUE_PATENT_TOKEN_LAUNCH,
              {
                applicationId,
                ownerWalletAddress: recipientWalletAddress,
              },
              {
                jobId: applicationId,
                attempts: 1,
                backoff: { type: 'exponential', delay: 5000 },
              },
            );

            logger.info(
              `Patent token launch job enqueued for application ${applicationId}`,
            );
          }
        } catch (enqueueError) {
          logger.error(
            `Failed to enqueue patent token launch job for application ${applicationId}:`,
            enqueueError,
          );
        }
      }

      applicationDal.trackActivity(app.owner, app.tags, {
        id: app.id,
        type: activityItem.INVENTION,
        action: activityAction.CREATE,
      });
      if (response.isFiled) {
        Promise.all([
          handleProfileUpdate(
            req.user.id,
            COMMON.APPLICATION,
            IDEAPOINTS.PATENT_PENDING,
            response.id,
            COMMON.PATENT_PENDING,
          ),
          handleItemsUpdate(
            response.selected,
            COMMON.C_SOLUTION,
            COMMON.SOLUTION,
            IDEAPOINTS.PATENT_PENDING_SOLUTION,
            COMMON.PATENT_PENDING_SOLUTION,
          ),
          handleItemsIdeaPointsUpdate(
            response.selected,
            MODALS.SOLUTION,
            IDEAPOINTS.PATENT_PENDING_SOLUTION,
          ),
          handleNewNotification(COMMON.CREATE, {
            ownerId: req.user.id,
            userId: req.user.id,
            itemType: COMMON.APPLICATION,
            ideaPoints: IDEAPOINTS.PATENT_PENDING,
            itemId: response.id,
            actions: [COMMON.PATENT_PENDING],
          }),
        ]).catch((error) => {
          return errors.handleError(
            res,
            error,
            ERRORS.ISFILED_IDEAPOINTS,
            logger,
          );
        });
      }
      // await emailService.sendApplicationSubmissionNotification({
      //   email: owner.email,
      //   userName: owner.username,
      //   recipientFirstName: owner.firstName || owner.username,
      //   conceptName: app.title,
      //   itemLinkUrl: `${process.env.CLIENT_HOST}/profiles/${req.user.key}?currentTab=Concepts&id=${req.params.id}`,
      // });
      //TODO: Uncomment this when SMTP server will set up
      // const tags = await applicationDal.getTags(app.tags);
      // await emailService.sendInventionReadyForNftEmail({
      //   email: owner.email,
      //   recipientName: owner.firstName || owner.email,
      //   inventionName: app.title,
      //   inventionTags: tags.join(', '),
      //   inventionUrl: `${process.env.HOST}/inventions/${app.key}`,
      //   mainImage: app.files && app.files[0] ? app.files[0].url : undefined,
      // });
    }
    const updatedApplication = await applicationDal.getOneByKey(
      req.params.id,
      req.user,
    );
    if (sign) {
      return res.json({
        link: `${process.env.PINATA_URL}/ipfs/${app.fillingEnvelopeId}`,
      });
    }
    return res.json({
      redirectTo: req?.params?.id,
      updatedApplication,
    });
  } catch (error) {
    const message = 'File application error';
    errors.handleError(res, error, message, logger);
  }
};
applicationController.fileCheck = async (req, res) => {
  const appUrl = getHost(req, true);
  const redirectUrlError = `${process.env.ADMIN_CLIENT_HOST}/applications-need/${req.params.id}/show?filedModal=true`;
  const redirectUrlSuccess = `${process.env.ADMIN_CLIENT_HOST}/applications-prev/${req.params.id}/show`;
  try {
    const app = await applicationDal.getOne(req.params.id, {
      isSuper: true,
    });
    if (!app || !app.fillingEnvelopeId) {
      res.redirect(redirectUrlError);
      return;
    }
    const envelop = await eSign.getEnvelop({
      appUrl,
      envelopeId: app.fillingEnvelopeId,
    });
    if (envelop.redirect) {
      res.redirect(redirectUrlError);
      return;
    }
    const isSigned = envelop.status === 'completed';
    if (!isSigned) {
      await applicationDal.updateInternal(req.params.id, {
        fillingEnvelopeId: undefined,
        fillingSignerClientId: undefined,
      });
      res.redirect(redirectUrlError);
      return;
    }
    try {
      const signDocument = await signDocumentDal.create({
        type: signDocType.APPLICATION_FILL,
        itemType: activityItem.APPLICATION,
        itemId: app.id,
        owner: app.owner,
        documentId: app.fillingEnvelopeId,
      });
      await applicationDal.updateInternal(req.params.id, {
        isFiled: true,
        fillingSignDocumentId: signDocument.id,
      });
      const owner = await profileDal.getOne(app.owner, { isSuper: true });
      const tags = await applicationDal.getTags(app.tags);

      //:TODO: Uncomment this when SMPT server set-up done
      // await emailService.sendInventionReadyForNftEmail({
      //   email: owner.email,
      //   recipientName: owner.firstName || owner.email,
      //   inventionName: app.title,
      //   inventionTags: tags.join(', '),
      //   inventionUrl: `${process.env.HOST}/inventions/${app.key}`,
      //   mainImage: app.files && app.files[0] ? app.files[0].url : undefined,
      // });
    } catch (err) {
      logger.info(`File signed application error: ${err.message}`);
      logger.error(err);
    }
    res.redirect(redirectUrlSuccess);
  } catch (error) {
    const message = 'File sign application error';
    errors.handleError(res, error, message, logger);
  }
};

const getRecipientWalletAndBalance = async (application) => {
  const owner = await profileDal.getOne(application.owner, { isSuper: true });
  if (!owner) {
    throw new Error('Application owner not found');
  }

  let recipientWalletAddress = owner.walletAddress;

  const Tag = mongoose.model(MODALS.TAG);
  const tag = await Tag.findOne({
    owner: application.owner,
  });

  if (tag?.walletAddress) {
    recipientWalletAddress = tag.walletAddress;
  } else if (!recipientWalletAddress) {
    throw new Error(
      'Application owner does not have a wallet address (neither user nor company wallet)',
    );
  }

  return { recipientWalletAddress };
};

applicationController.startNft = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }

    const applicationId = req.params.id;
    const app = await applicationDal.getOne(applicationId, {
      isSuper: true,
    });

    if (!app) {
      throw new NotFound();
    }

    // Check if this is an admin request for patent token launch
    // Automatically detect: admin user + filed application = patent token launch
    // const isAdminRequest = isAdmin(req.user);
    const isPatentTokenLaunch = app.isFiled;

    if (isPatentTokenLaunch) {
      // Admin patent token launch flow: check balance, estimate gas, and enqueue job

      // Check if already deploying or deployed
      logger.info('Checking deployingStatus in startNft:', {
        applicationId,
        deployingStatus: app.deployingStatus,
        deployingStatusType: typeof app.deployingStatus,
        isDeploying: app.deployingStatus === 'deploying',
      });

      if (app.deployingStatus === 'deployed' && app.nftTokenId) {
        logger.warn('startNft: Application already deployed:', {
          applicationId,
          deployingStatus: app.deployingStatus,
          nftTokenId: app.nftTokenId,
        });
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          status: 'already_minted',
          message: 'Patent token has already been minted',
          nftTokenId: app.nftTokenId,
          nftTransactionUrl: app.nftTransactionUrl,
        });
      }

      if (app.deployingStatus === 'deploying') {
        logger.info(
          'startNft: Application already deploying, worker needs tokenURI. Generating metadata...',
          {
            applicationId,
            deployingStatus: app.deployingStatus,
          },
        );
      } else {
        // Get recipient wallet address
        const { recipientWalletAddress } =
          await getRecipientWalletAndBalance(app);

        // Check admin wallet balance and estimate gas
        const adminWalletAddress = wallet.address;
        const balance = await provider.getBalance(adminWalletAddress);

        const IdeaNftContract = new ethers.Contract(
          process.env.NFT_CONTRACT_ADDRESS,
          require('../contract/IdeaNft.json'),
          wallet,
        );

        // Verify admin wallet is the contract owner
        const contractOwner = await IdeaNftContract.owner();
        if (contractOwner.toLowerCase() !== adminWalletAddress.toLowerCase()) {
          return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: 'gas_estimation_failed',
            message: 'Admin wallet is not the contract owner',
          });
        }

        // Validate recipient address
        if (
          !recipientWalletAddress ||
          recipientWalletAddress === ethers.constants.AddressZero
        ) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            status: 'invalid_recipient',
            message: 'Invalid recipient wallet address',
          });
        }

        const dummyTokenURI = 'ipfs://dummy';
        let gasEstimate;
        try {
          gasEstimate = await IdeaNftContract.estimateGas.mintNFT(
            recipientWalletAddress,
            dummyTokenURI,
          );
        } catch (error) {
          logger.error('Gas estimation failed in startNft:', error);
          return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: 'gas_estimation_failed',
            message: 'Failed to estimate gas for transaction',
            error: error.message,
          });
        }

        const gasPrice = await provider.getGasPrice();
        const requiredGas = gasEstimate.mul(gasPrice);
        const requiredGasEth = parseFloat(
          ethers.utils.formatEther(requiredGas),
        );
        const currentBalanceEth = parseFloat(ethers.utils.formatEther(balance));

        // Check if balance is sufficient (add 20% buffer)
        const requiredWithBuffer = requiredGas.mul(120).div(100);
        if (balance.lt(requiredWithBuffer)) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            status: 'insufficient_funds',
            message: 'Admin wallet has insufficient funds for gas',
            requiredGasEth: requiredGasEth * 1.2,
            currentBalanceEth,
          });
        }

        // Atomically update status to "deploying" to prevent duplicate enqueues
        const updateResult = await mongoose
          .model(MODALS.APPLICATION)
          .findOneAndUpdate(
            {
              _id: applicationId,
              $or: [
                { deployingStatus: { $exists: false } },
                { deployingStatus: 'not_deployed' },
                { deployingStatus: null },
              ],
            },
            {
              $set: {
                deployingStatus: 'deploying',
              },
            },
            { new: true },
          );

        if (!updateResult) {
          const currentApp = await applicationDal.getOne(applicationId, {
            isSuper: true,
          });
          return res.status(HTTP_STATUS.CONFLICT).json({
            status: 'already_pending',
            message: 'Patent token launch was already initiated',
            deployingStatus: currentApp.deployingStatus,
          });
        }

        // Enqueue BullMQ job
        const job = await queueDb.queues[QUEUE_PATENT_TOKEN_LAUNCH].add(
          QUEUE_PATENT_TOKEN_LAUNCH,
          {
            applicationId,
            ownerWalletAddress: recipientWalletAddress,
          },
          {
            jobId: applicationId,
            attempts: 1,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );

        logger.info('Patent token launch job enqueued:', {
          applicationId,
          jobId: job?.id || applicationId,
          queueJobId: job?.id,
          ownerWalletAddress: recipientWalletAddress,
          deployingStatus: updateResult?.deployingStatus,
        });

        return res.json({
          status: 'enqueued',
          message: 'Patent token launch job has been enqueued',
          currentBalanceEth,
          requiredGasEth,
          recipientWalletAddress,
        });
      }
    }

    // Regular NFT deployment flow: prepare metadata
    const appWithPopulate = await mongoose
      .model(MODALS.APPLICATION)
      .findOne({ _id: req.params.id })
      .populate([
        { path: APPLICATION_PATHS.SELECTED, model: MODALS.SOLUTION },
        {
          path: 'problems',
          select: 'parentProduct',
          model: MODALS.PROBLEM,
          populate: {
            path: 'parentProduct',
            select: 'company',
            model: MODALS.COMPANY_PRODUCT,
            populate: {
              path: 'company',
              select: '_id name type owner',
              model: MODALS.TAG,
            },
          },
        },
      ]);

    if (!appWithPopulate) {
      throw new NotFound();
    }

    let tags = await applicationDal.getTags(app.tags);
    let owner = {};
    try {
      owner = await profileDal.getOne(app.owner, req.user);
    } catch (err) {
      console.error('Error:', err);
    }
    let imageObj =
      app?.files?.[0]?.url ?? app?.selected?.[0]?.files?.[0]?.url ?? '';
    const imageUrl = await ipFs.uploadImageUrlToIpfs(imageObj);

    // To check image url logs on server
    // console.log('Deploying image url:', imageUrl, imageObj);
    // const signDocs = await signDocumentDal.getByItemIdAndType(
    //   app.id,
    //   signDocType.APPLICATION_BUY,
    // );
    // const signDocs2 = await signDocumentDal.getByItemIdAndType(
    //   app.id,
    //   signDocType.APPLICATION_FILL,
    // );
    // const signDocsUrl = [];
    // await Promise.all(
    //   [...signDocs, ...signDocs2].map((signDoc, index) => {
    //     const PINATA_URL = process.env.PINATA_URL;

    //     let docUrl = `${PINATA_URL}/ipfs/${signDoc.documentId}`;
    //     signDocsUrl.push(docUrl);
    //   }),
    // );
    let nftPdfUrl = null;
    if (app?.isDownloaded) {
      let nftPdfPath = await exportService.getNFTInfoFile(
        app.fillingPatentNumber,
        app.fillingTime,
      );
      const nftPdf = fs.readFileSync(nftPdfPath);
      const [, url] = await ipFs.upload({
        data: nftPdf,
        title: `Exhibit_B.pdf`,
      });
      nftPdfUrl = url;
      await fs.unlinkSync(nftPdfPath);
    }
    let details = {};
    if (owner?.username) details.owner = owner.username;
    if (app?.body) details.description = app.body;
    if (app?.fillingEnvelopeId)
      details.signedDocument = `${process.env.PINATA_URL}/${COMMON.IPFS}/${app.fillingEnvelopeId}`;
    if (app?.fillingPatentReceipt)
      details.usptoFile = `${process.env.PINATA_URL}/${COMMON.IPFS}/${app.fillingPatentReceipt}`;
    if (nftPdfUrl) details.exhibitBFile = nftPdfUrl;
    const metadata = {
      name: app?.teaser ?? app?.title,
      details,
      image: imageUrl,
      attributes: tags.map((tag) => ({
        trait_type: 'Tag',
        value: tag.name,
        display_type: 'string',
        key: tag.key,
      })),
      external_url: `${process.env.HOST}/inventions/${app.id}`,
    };

    if (imageUrl) {
      metadata.image = imageUrl;
    }

    const [, fileUrl] = await ipFs.uploadJson(metadata, app.id);
    const data = {
      contractAddress: process.env.NFT_CONTRACT_ADDRESS,
      contractMarketAddress: process.env.MARKETPLACE_CONTRACT_ADDRESS,
      tokenURI: fileUrl,
    };
    res.json(data);
  } catch (error) {
    const message = 'Deploy application NFT error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.finishNft = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const { price, tokenURI = '' } = req.body;

    await applicationDal.updateInternal(req.params.id, {
      deployingStatus: 'deploying',
    });

    const app = await mongoose
      .model(MODALS.APPLICATION)
      .findOne({ _id: req.params.id })
      .populate([
        { path: APPLICATION_PATHS.SELECTED, model: MODALS.SOLUTION },
        {
          path: 'problems',
          select: 'parentProduct',
          model: MODALS.PROBLEM,
          populate: {
            path: 'parentProduct',
            select: 'company',
            model: MODALS.COMPANY_PRODUCT,
            populate: {
              path: 'company',
              select: '_id name type owner',
              model: MODALS.TAG,
            },
          },
        },
      ])
      .lean();

    const uniqueTags = [...new Set(app?.tags || [])].filter(
      (v) => v !== undefined,
    );
    const uniqueTagIds = uniqueTags.map((tag) => getPk(tag));
    let imageURL =
      app.files?.length > 0
        ? app?.files?.[0]?.url
        : app.selected[0]?.files[0]?.url;

    const { walletAddress, recipientAddress } = req.body;
    const targetWalletAddress = walletAddress || req.user.walletAddress;
    const mintToAddress = recipientAddress || req.user.walletAddress;

    // Get the private key for the wallet address (verifies it belongs to user, company, or admin)
    const privateKey = await blockchainController.getPrivateKeyForWalletAddress(
      req.user.id || req.user._id,
      targetWalletAddress,
    );
    const signer = new ethers.Wallet(
      privateKey,
      new ethers.providers.JsonRpcProvider(process.env.INFURA_URL),
    );

    const ideaNftContract = new ethers.Contract(
      process.env.NFT_CONTRACT_ADDRESS,
      require('../contract/IdeaNft.json'),
      signer,
    );

    const deployNftTxn = await ideaNftContract.mintNFT(mintToAddress, tokenURI);
    const receipt = await deployNftTxn.wait();

    const event = receipt.events[0];

    const value = event.args[2];
    const tokenId = value.toNumber();

    const { transactionHash } = receipt;

    await applicationDal.updateInternal(req.params.id, {
      deployingStatus: 'deployed',
    });

    const nft = {
      name: app?.teaser || app?.title,
      image: imageURL,
      tags: uniqueTagIds,
      owner: app.owner,
      tokenId,
      transactionHash,
      invention: app?._id ?? app.id,
      URI: tokenURI,
    };
    //creating in-app local copy of NFT
    const createdNft = await nftDal.create(nft, req.user);
    const nftActivity = {
      nft: createdNft.id,
      from: COMMON.NULL_ADDRESS,
      to: mintToAddress,
      event: COMMON.MINT,
      price: 0,
      txHash: transactionHash,
    };
    //tracking NFT activity
    nftActivityDal.create(nftActivity, req.user);

    // insert entry in RoyaltyCoinsRewards.
    if (createdNft.tags && createdNft.tags.length > 0) {
      const totalTags = createdNft.tags.length;
      const amountPerTag = 1 / totalTags;

      // Create royalty coin reward entry for each tag
      for (const tagId of createdNft.tags) {
        await royaltyCoinsRewardsDal.create(
          {
            rewardedEntity: tagId,
            rewardedEntityType: MODALS.TAG,
            sourceEntity: createdNft.id,
            sourceEntityType: MODALS.NFT,
            action: ROYALTY_COIN_ACTIONS.NFT_MINT,
            amount: amountPerTag,
          },
          req.user,
        );
      }
    }

    const creditsHistory = {
      _id: new ObjectId(),
      action: CREDIT_ACTIONS.MINT_NFT,
    };
    const isOwnerOrEmployee = await isCompanyEmployeeOrOwner(
      req?.user?.id,
      app,
    );
    await subtractCredits(
      req.user.id,
      Number(process.env.NFT_TRANSACTION_COST),
      creditsHistory,
      null,
      GENERATION_TYPES.NFT_TRANSACTION,
      false,
      isOwnerOrEmployee,
    );
    triggerCreditsPusher(creditsHistory._id, req.user.id);

    const update = {
      isPublic: true,
      nftPrice: price,
      nftTokenId: tokenId,
      nftTransactionUrl: tokenId
        ? `${process.env.NFT_OPENSEA_ADDRESS}/${process.env.NFT_CONTRACT_ADDRESS}/${tokenId}`
        : undefined,
      nftTransactionUrl2: transactionHash
        ? `${process.env.NFT_TX_ADDRESS}/${transactionHash}`
        : undefined,
      nft: createdNft.id,
    };

    const A = await rewardDal.getRewardsAdjustmentFactor();
    await rewardDal.addReward({
      itemId: req.params.id,
      userOrId: req.user,
      amount: A,
      resource: rewardResource.APPLICATION,
      type: rewardType.NFT_DEPLOY,
      tags: app.tags,
      problems: [app.problems],
    });
    const rewardsOwner = await profileDal.getRewardsOwner();
    if (rewardsOwner) {
      // add MindMiner reward
      await rewardDal.addReward({
        itemId: req.params.id,
        userOrId: rewardsOwner,
        amount: 2 * A,
        resource: rewardResource.APPLICATION,
        type: rewardType.NFT_DEPLOY_MM,
        tags: app.tags,
        problems: [app.problems],
      });
    }
    // unrealize app & solutions
    const unrealized = await rewardDal.getUnrealized(
      req.params.id,
      app.selected,
    );
    await Promise.all(
      unrealized.map((item) => {
        return rewardDal
          .unsetUnrealized(item.id, item.type)
          .then(() => {
            return profileDal.updateBalance(
              item.userId.toString(),
              item.amount,
            );
          })
          .catch((err) => {
            logger.error(err);
          });
      }),
    );
    const data = await applicationDal.update(req.params.id, update, req.user);
    handleNewNotification(COMMON.CREATE, {
      ownerId: req.user.id,
      userId: req.user.id,
      itemType: COMMON.APPLICATION,
      ideaPoints: null,
      itemId: data.id,
      actions: [COMMON.DEPLOY_NFT],
    });
    await contestDal.addNftToContest(data);
    res.json(data);
  } catch (error) {
    await applicationDal.updateInternal(req.params.id, {
      deployingStatus: 'not_deployed',
    });
    const message = 'Deploy application NFT finish error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getNftInfo = async (req, res) => {
  try {
    let tokens;
    let data;
    if (req.query.tokens) {
      tokens = req.query.tokens ? JSON.parse(req.query.tokens) : [];
      data = await applicationDal.getNftInfo(tokens);
    } else {
      const items = await marketplace.fetchMarketItems();
      tokens = items.map((el) => el.tokenId);
      const apps = await applicationDal.getNftInfo(tokens);
      data = items
        .map((item) => ({
          ...item,
          app: apps.find((el) => el.nftTokenId === item.tokenId),
        }))
        .filter((el) => el.app);
    }
    res.json({ data });
  } catch (error) {
    const message = 'Get NFT info error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getVotes = async (req, res) => {
  try {
    const data = await applicationDal.getVotes(req.params.id, req.user);
    const base = 2;
    const coins = {};
    const type = `${rewardType.APP_IMPROVE}-${req.params.id}-`;
    const totalVotedItems = await rewardDal.getRecordsByType(type, {
      isRegExpType: true,
    });
    totalVotedItems.forEach((item) => {
      const voteType = item.type.replace(type, '');
      if (coins[voteType]) {
        coins[voteType] += 1;
      } else {
        coins[voteType] = 1;
      }
    });
    Object.keys(coins).forEach((key) => {
      const total = totalVotedItems.length;
      const amount = base - coins[key] / total;
      if (amount >= 0.1) {
        coins[key] = parseFloat(amount.toFixed(2));
      } else {
        coins[key] = 0;
      }
    });
    coins.base = base;
    data.coins = coins;
    res.json(data);
  } catch (error) {
    const message = 'Get application votes error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.updateVotes = async (req, res) => {
  try {
    const data = await applicationDal.updateVotes(
      req.params.id,
      req.body,
      req.user,
    );
    res.json(data);
  } catch (error) {
    const message = 'Update application votes error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.create = async (req, res) => {
  const appUrl = getHost(req, true);
  try {
    const appInfo = req.body;
    const totalApplications = await applicationDal.getCount({}, req.user);
    const conceptTitle = `Concept ${totalApplications + 1}`;
    const creditsHistory = {
      _id: new ObjectId(),
      action: CREDIT_ACTIONS.CREATE_CONCEPT,
    };
    const data = await applicationDal.create(
      appInfo,
      req.user,
      conceptTitle,
      creditsHistory,
    );
    await updateCreditsHistory(creditsHistory._id, {
      item: data.id,
      itemType: MODALS.APPLICATION,
    });
    await triggerCreditsPusher(creditsHistory._id, req.user.id);

    if (data.parentProduct) {
      const product = await companyProductDal.getOne(data.parentProduct, {
        isSuper: true,
      });

      await emailService.sendProductImproveEmail({
        email: req.user.email,
        recipientFirstName:
          req.user.firstName || req.user.username || req.user.email,
        inventionLinkUrl: `${appUrl}/inventions/${data.key}`,
        productTitle: product.title,
        productLinkUrl: `${appUrl}/products/${product.key}`,
        company: product.companyName,
        companyLinkUrl: `${appUrl}/tags/${product.companyKey}`,
        mainImage:
          product.files && product.files[0] ? product.files[0].url : undefined,
      });
    }

    if (appInfo && appInfo.parentApplication && appInfo.type) {
      try {
        if (appInfo.selected && appInfo.selected[0]) {
          const solution = await solutionDal.getOne(
            appInfo.selected[0],
            req.user,
          );
          if (solution && solution.isPublic) {
            const tags = await tagDal.getTagsNames(solution.tags);
            // send notification
            const app = await applicationDal.getOne(appInfo.parentApplication, {
              isSuper: true,
            });
            const owner = await profileDal.getOne(app.owner, { isSuper: true });
            await emailService.sendInventionImproveEmail({
              email: owner.email,
              recipientName: owner.firstName || owner.email,
              fromUserName: req.user.username,
              solutionName: solution.title,
              solutionTags: tags.join(', '),
              solutionUrl: `${appUrl}/solutions/${solution.key}`,
              parentInventionName: app.title,
              mainImage:
                app.files && app.files[0] ? app.files[0].url : undefined,
            });
          }
        }
      } catch (err) {
        logger.warn('Check parent application error', err.message);
      }
      const typeItems = await rewardDal.getRecordsByType(
        `${rewardType.APP_IMPROVE}-${appInfo.parentApplication}-${appInfo.type}`,
        { isRegExpType: true },
      );
      const totalItems = await rewardDal.getRecordsByType(
        `${rewardType.APP_IMPROVE}-${appInfo.parentApplication}`,
        { isRegExpType: true },
      );
      let amount = 2;
      if (totalItems && totalItems.length) {
        amount = amount - typeItems.length / totalItems.length;
      }
      // amount = A * amount;
      if (amount >= 0.1) {
        // add unrealized improve application reward
        await rewardDal.addReward({
          itemId: data.id,
          userOrId: req.user,
          amount: parseFloat(amount.toFixed(2)),
          resource: rewardResource.APPLICATION,
          type: `unrealized-${rewardType.APP_IMPROVE}-${appInfo.parentApplication}-${appInfo.type}`,
          tags: data.tags,
          problems: [data.problems],
        });
      }
    }
    res.json(data);
  } catch (error) {
    const message = 'Create application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.update = async (req, res) => {
  try {
    const creditsHistory = {
      _id: new ObjectId(),
      action: CREDIT_ACTIONS.UPDATE_CONCEPT,
      item: req.params.id,
      itemType: MODALS.APPLICATION,
    };
    const data = await applicationDal.update(
      req.params.id,
      req.body,
      req.user,
      creditsHistory,
    );
    if (req.body.referralCode) {
      handleProfileUpdate(
        req.body.referralCode,
        COMMON.APPLICATION,
        IDEAPOINTS.REFERRED_CONCEPT_ADDITION,
        req.params.id,
        COMMON.REFERRED_CONCEPT_ADDITION,
      );
      handleNewNotification(COMMON.CREATE, {
        ownerId: req.body.referralCode,
        itemType: COMMON.APPLICATION,
        ideaPoints: IDEAPOINTS.REFERRED_CONCEPT_ADDITION,
        itemId: req.params.id,
        actions: [COMMON.REFERRED_CONCEPT_ADDITION, COMMON.SHARE],
      });
    }
    // update unrealized
    const A = await rewardDal.getRewardsAdjustmentFactor();
    const allSolutions = await solutionDal.getFullList(data.selected);

    if (data && data.selected.length >= 3) {
      const notifiedFollowers = {};

      for (const solution of allSolutions) {
        const { likes, dislikes, tags } = solution;

        const SELECTED_COMMUNITY_IDEAPOINTS =
          await CalculateMultiplierIdeapoints(
            likes,
            dislikes,
            IDEAPOINTS.CONCEPT_SOLUTION_THREE,
          );

        if (tags && tags.length > 0) {
          const Tag = mongoose.model('Tag');
          const tagsInfo = await Tag.find(
            { _id: { $in: tags.map((id) => new mongoose.Types.ObjectId(id)) } },
            { _id: 1, followers: 1 },
          );

          const promises = [
            handleTagsUpdate(
              data.tags,
              req.user.id,
              COMMON.L_Tag,
              SELECTED_COMMUNITY_IDEAPOINTS,
            ),
            ...tagsInfo.flatMap((tag) => {
              if (tag.followers && tag.followers.length > 0) {
                return tag.followers.map((followerId) => {
                  if (!notifiedFollowers[followerId]) {
                    notifiedFollowers[followerId] = {};
                  }

                  if (!notifiedFollowers[followerId][tag._id]) {
                    notifiedFollowers[followerId][tag._id] = true;

                    return handleNewNotification(COMMON.CREATE, {
                      ownerId: followerId,
                      userId: followerId,
                      itemType: COMMON.COMMUNITY,
                      ideaPoints: SELECTED_COMMUNITY_IDEAPOINTS,
                      itemId: tag._id,
                      actions: [COMMON.SELECTED_CONCEPT_COMMUNITY],
                    });
                  }
                  return null;
                });
              }
              return [];
            }),
          ];
          await Promise.all(promises);
        }
      }
    }

    if (allSolutions && allSolutions.length) {
      const reward = A * (1 / allSolutions.length);
      for (const solution of allSolutions) {
        // add unrealized solution reward
        await rewardDal.addReward({
          itemId: solution.id,
          userOrId: solution.owner.toString(),
          amount: reward,
          type: `unrealized-${rewardType.APP_PAY}-${data.id}-solution`,
          resource: rewardResource.SOLUTION,
          tags: solution.tags,
          problems: [solution.problem],
        });
      }
    }
    res.json(data);
  } catch (error) {
    const message = 'Update application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.updateQuotationStatus = async (req, res) => {
  try {
    const data = await applicationDal.update(req.params.id, req.body, req.user);
    const manufacturers = await mongoose
      .model(MODALS.MANUFACTURER_COMPANY)
      .find()
      .select(COMMON.KEY_REPRESENTATIVE);
    let keyRepresentatives = [];
    if (manufacturers?.length > 0) {
      keyRepresentatives = manufacturers?.flatMap(
        (manufacturer) => manufacturer?.keyRepresentatives || [],
      );
    }

    const manufacturerData = await mongoose
      .model(MODALS.PROFILE)
      .find({ _id: { $in: keyRepresentatives } });

    const inventorData = await mongoose
      .model(MODALS.PROFILE)
      .findOne({ _id: data?.owner });
    const inventorHighlevelData = {
      email: inventorData?.email,
      tags: COMMON.MANUFACTURER,
      firstName: inventorData?.username,
      customFields: [
        {
          id: `${process.env.BID_INVENTOR}`, //inventor name as bid inventor
          field_value: inventorData?.username || '',
        },
        {
          id: `${process.env.INVENTION_NAME}`, //invention name
          field_value: `${data?.title}` || '',
        },
      ],
    };
    inventorHighlevelData.locationId = `${process.env.LOCATION_ID}`;

    try {
      const inventorApiCall = await goHighLevelService.createContact(
        inventorHighlevelData,
      );
      await mongoose
        .model(MODALS.PROFILE)
        .findOneAndUpdate(
          { _id: inventorData?._id },
          { contactId: inventorApiCall?.contact?.id },
        );
    } catch (apiError) {
      console.error(ERRORS.BID_INVENTOR_ERROR, inventorData.username, apiError);
    }

    if (keyRepresentatives?.length > 0) {
      handleNewNotification(COMMON.CREATE, {
        ownerId: req.user.id,
        userId: keyRepresentatives,
        itemType: TYPES.APPLICATION,
        itemId: data.id,
        actions: [COMMON.QUOTATION],
      });
    }
    // Process each manufacturer and send email via gohighlevel once staking started
    for (const manufacturer of manufacturerData) {
      const manufacturerHighleveleData = {
        email: manufacturer.email,
        tags: COMMON.MANUFACTURER,
        firstName: manufacturer.username,
        customFields: [
          {
            id: `${process.env.BID_MANUFACTURER}`, //manufacturer name as bid manufacturer
            field_value: manufacturer.username || '',
          },
          {
            id: `${process.env.INVENTION_NAME}`, //invention name
            field_value: `${data?.title}` || '',
          },
          {
            id: `${process.env.SENDER_NAME}`, //sender name who is sending the email
            field_value: req?.user?.username || '',
          },
          {
            id: `${process.env.SUBMIT_BID_BTN_URL}`, //clicking on submit bid now button
            field_value:
              `${process.env.CLIENT_HOST}/manufacturer-dashboard/${manufacturer.key}` ||
              '',
          },
        ],
      };
      manufacturerHighleveleData.locationId = `${process.env.LOCATION_ID}`;
      try {
        const manufacturerApiCall = await goHighLevelService.createContact(
          manufacturerHighleveleData,
        );
        await mongoose
          .model(MODALS.PROFILE)
          .findOneAndUpdate(
            { _id: manufacturer._id },
            { contactId: manufacturerApiCall?.contact?.id },
          );
      } catch (apiError) {
        console.error(
          ERRORS.BID_MANUFACTURER_ERROR,
          manufacturer.username,
          apiError,
        );
      }
    }
    res.status(200).json(data);
  } catch (error) {
    const message = 'Update application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.updateInvention = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id || !updateData) {
      return res
        .status(400)
        .json({ error: ERRORS.ERROR_ID_AND_UPDATED_DATA_REQUIRED });
    }

    const result = await mongoose
      .model(MODALS.APPLICATION)
      .findByIdAndUpdate({ _id: id }, { $set: updateData });

    res
      .status(200)
      .json({ message: SUCCESS_MESSAGES.UPDATED_SUCCESSFULLY, result });
  } catch (error) {
    console.error(ERRORS.UPDATE_INVENTION, error);
    res.status(500).json({ error: ERRORS.UPDATE_INVENTION });
  }
};

applicationController.pin = async (req, res) => {
  const { isPinned, isFiled } = req.body;
  try {
    await pinItem(
      applicationDal,
      'Application',
      req.params.id,
      isPinned,
      req.user,
      isFiled,
    );
    res.json(true);
  } catch (error) {
    const message = 'Update application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.delete = async (req, res) => {
  try {
    const data = await applicationDal.delete(req.params.id, req.user);
    let defaultConcept;

    const concepts = await mongoose
      .model(MODALS.APPLICATION)
      .find({ owner: req.user.id, isFiled: false, isPaid: false });

    if (concepts.length === 0) {
      defaultConcept = await applicationDal.create(
        { title: '' },
        req.user,
        COMMON.DEFAULT_CONCEPT_TITLE,
      );
    } else {
      defaultConcept = concepts[0];
    }

    const query = { _id: req.user.id };
    await mongoose
      .model(MODALS.PROFILE)
      .findOneAndUpdate(
        query,
        { activeConcept: defaultConcept?.id },
        { new: true },
      );

    res.json(data);
  } catch (error) {
    const message = 'Delete application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.deleteBunch = async (req, res) => {
  try {
    const data = await applicationDal.deleteBunch(req.body.ids, req.user);
    res.json(data);
  } catch (error) {
    const message = 'Delete applications error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.deleteTag = async (req, res) => {
  try {
    const data = await applicationDal.deleteTag(
      req.params.id,
      req.params.tagKey,
      req.user,
    );
    res.json(data);
  } catch (error) {
    const message = 'Delete application tag error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.updateTags = async (req, res) => {
  try {
    const moderatorTags = await tagDal.getModeratorTags(req.user);
    const data = await applicationDal.updateTags(
      req.params.id,
      req.body,
      moderatorTags,
      req.user,
    );
    res.json(data);
  } catch (error) {
    const message = 'Update application tag error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.startPay = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const { finalizeType = FINALIZE_TYPE.OWN, paymentType = '' } =
      req.body || {};

    const stats = await profileDal.getStats(req.user.id, rewardDal);
    if (stats.credits < 1) {
      throw new UnprocessableEntity('Not enough credits');
    }

    const newApp = await applicationDal.updateInternal(req.params.id, {
      finalizeType,
      paymentType,
      inPayment: true,
    });
    res.json(newApp);
  } catch (error) {
    const message = 'Application pay start error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.clearPay = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    await applicationHelper.clearPayment(req.params.id, req.user);
    res.json({});
  } catch (error) {
    const message = 'Application pay clear error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.finishPay = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const newApp = await applicationHelper.finishPay(
      req.params.id,
      req.user.id,
      req.headers.origin,
    );
    res.json(newApp);
  } catch (error) {
    const message = 'Application pay finish error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.requestPay = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const { redirect, sign, ipAddress } = req.body || {};
    if (redirect) {
      redirects[req.params.id] = redirect;
    }
    const application = await applicationDal.getOne(req.params.id, req.user);
    if (!application) {
      res.json({ error: true, message: 'No invention found' });
      return;
    }
    let owner = {};
    try {
      owner = await profileDal.getOne(application.owner, req.user);
    } catch (err) {}

    let data = {};
    let signedDocId = '';
    if (
      !application.envelopeId ||
      !(await ipFs.trackPinataFile(application.envelopeId))
    ) {
      const signerClientId = new Date().getTime();
      const { fileId, fileUrl } = await uploadClientSignedDocument(
        sign,
        application,
        owner,
        signerClientId,
        ipAddress,
      );
      console.log('File ID:', fileId);
      data = {
        envelopeId: fileId, //Signed Aggreement Doc id
        isLocked: true,
        signerClientId: signerClientId,
        status: SIGN_STATUS.SIGNED,
      };
      signedDocId = fileId;
      await applicationDal.update(req.params.id, data, req.user);
    }
    res.json({
      link: `${process.env.PINATA_URL}/${COMMON.IPFS}/${signedDocId}`,
    });
  } catch (error) {
    const msg =
      (error.response && error.response.body && error.response.body.message) ||
      error;
    const message = `Application request pay error: ${msg}`;
    errors.handleError(res, error, message, logger);
  }
};

async function uploadClientSignedDocument(
  sign,
  invention,
  owner,
  signerClientId,
  ipAddress,
) {
  const data = await signClientDocument(sign, invention, owner, ipAddress);
  const [fileId, fileUrl] = await ipFs.upload({
    data,
    title: `Sign-${signerClientId}.pdf`,
  });
  return { fileId, fileUrl };
}

async function uploadAdminSignedDocument(
  patentNumber,
  sign,
  patentDate,
  solutions,
  invention,
  owner,
  signerClientId,
  ipAddress,
) {
  const { adminDocPdfBytes } = await signAdminDocument(
    patentNumber,
    sign,
    patentDate,
    solutions,
    invention,
    owner,
    ipAddress,
  );
  const [fileId, fileUrl] = await ipFs.upload({
    data: adminDocPdfBytes,
    title: `Sign-${signerClientId}.pdf`,
  });
  return { fileId, fileUrl };
}

applicationController.requestPay2 = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const { redirect, test } = req.body || {};
    const application = await applicationDal.getOne(req.params.id, req.user);
    if (!application) {
      res.json({ error: true, message: 'No invention found' });
      return;
    }
    let owner = {};
    try {
      owner = await profileDal.getOne(application.owner, req.user);
    } catch (err) {}
    const { products = [] } = application;
    const product = products.find((i) => i.productId === req.params.payId);
    if (!product) {
      res.json({ error: true, message: 'No invention product found' });
      return;
    }

    if (test) {
      product.payStatus = PAY_STATUS.PAYED;
      await applicationDal.updateInternal(req.params.id, { products });
      res.json({});
      return;
    }

    const charge = await coinbase.chargesCreate({
      name: product.title,
      description: product.subTitle,
      price: `${product.price}`,
      redirectUrl: redirect,
    });
    product.payCode = charge.code;
    product.payStatus = PAY_STATUS.PENDING;
    await applicationDal.updateInternal(req.params.id, { products });

    res.json({ redirect: charge.hosted_url });
  } catch (error) {
    const msg =
      (error.response && error.response.body && error.response.body.message) ||
      error;
    const message = `Application request pay2 error: ${msg}`;
    errors.handleError(res, error, message, logger);
  }
};

applicationController.requestPay2Webhook = async (req, res) => {
  try {
    const bodyStr = JSON.stringify(req.body);
    const signature = req.headers['x-cc-webhook-signature'];

    const event = await coinbase.getEvent(bodyStr, signature);

    logger.info(`coinbase webhook event: "${event.type}" \n`);
    logger.debug(
      JSON.stringify(
        {
          code: event.data.code,
          hosted_url: event.data.hosted_url,
        },
        null,
        2,
      ),
    );
    const { type, data = {} } = event || {};
    const { code = '' } = data;

    const application = await applicationDal.findByPayCode(code);

    if (!application) {
      return;
    }

    const { products = [] } = application;
    const product = products.find((i) => i.payCode === code);

    if (!product) {
      return;
    }

    if (type === 'charge:failed') {
      product.payCode = undefined;
      product.payStatus = PAY_STATUS.PREPARE;
      await applicationDal.updateInternal(application.id, { products });
    }

    if (type === 'charge:pending') {
      product.payStatus = PAY_STATUS.PENDING;
      await applicationDal.updateInternal(application.id, { products });
    }

    if (
      type === 'charge:confirmed' ||
      type === 'charge:delayed' ||
      type === 'charge:resolved'
    ) {
      product.payCode = undefined;
      product.payStatus = PAY_STATUS.PAYED;
      await applicationDal.updateInternal(application.id, { products });
    }
    res.send('ok');
  } catch (error) {
    const msg =
      (error.response && error.response.body && error.response.body.message) ||
      error;
    const message = `Application request pay2 webhook error: ${msg}`;
    logger.error(message);
    res.send('error');
  }
};

applicationController.createInitialSessionForPayment = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const userId = req.user.id.toString();
    const userKey = req.user.key;
    const baseUrl = `${process.env.HOST}/api/applications/updatePaymentStatus/${req.params.id}`;
    const { redirectURL, items, mode, patentFileFlow } = req.body;
    let patentFileFlowParam = '';
    if (patentFileFlow) {
      patentFileFlowParam = `&patentFileFlow=${patentFileFlow}`;
    }
    const data = await stripe.create(items, {
      success_url: `${baseUrl}?status=${PAYMENT_STATUS.APPROVED}&userId=${userId}&userKey=${userKey}&sessionId={CHECKOUT_SESSION_ID}${patentFileFlowParam}`,
      cancel_url: `${baseUrl}?status=${PAYMENT_STATUS.CANCELLED}&userId=${userId}&userKey=${userKey}`,
      billing_address_collection: 'required',
      mode,
      useStripePrice: true,
      metadata: {
        userId,
        userKey,
        applicationId: req.params.id,
        redirectURL,
      },
    });

    res.json(data);
  } catch (error) {
    const message = 'Initial Session for Payment application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { sessionId, userId, status, userKey, patentFileFlow } = req.query;
  let redirectTo = `${process.env.CLIENT_HOST}/profiles/${userKey}?currentTab=concepts&id=${id}`;
  try {
    if (status === PAYMENT_STATUS.CANCELLED) {
      throw 'Payment Cancelled';
    }

    const session = await stripe.retrieve(sessionId);
    const redirectURL = session.metadata.redirectURL;
    redirectTo = redirectURL ?? redirectTo;
    const {
      customer_details: {
        address: { postal_code, ...rest },
      },
      mode,
    } = session;

    const user = await mongoose.model('Profile').findOne({ _id: userId });
    if (mode === 'subscription') {
      const { subscriptionId } = await subscriptionHelper.finalize(sessionId);
      const subscription = await subscriptionHelper.retrieve(subscriptionId);
      await profileDal.updateInternal(userId, {
        subscription: subscriptionId,
      });
      //PENDING: Giving static type if nickname is not available.
      //This need to be handled and made dynamic.
      const payload = {
        status: 'approved',
        termsAgree: true,
        title: '',
        type:
          subscription &&
          (subscription.plan.nickname ?? SUBSCRIPTION.INDIVIDUAL),
        url: '',
        userId: user.id.toString(),
      };
      await subscriptionDal.create(payload, user);
    }
    const addressPayload = {
      profile: userId,
      postalCode: postal_code,
      ...rest,
    };
    await billingAddressDal.createIfNotExist(addressPayload);
    await applicationDal.updatePaymentStatus(id, status);
    await applicationDal.update(
      id,
      {
        patentFileFlow,
      },
      user,
    );
    const response = await mongoose
      .model(COMMON.C_APPLICATION)
      .findById(id)
      .lean();

    const tags = await mongoose.model(COMMON.TAG).find({ _id: response.tags });
    const solutionIds = response.selected;
    const selectedSolutions = await mongoose
      .model(COMMON.C_SOLUTION)
      .find({ _id: { $in: solutionIds } });
    for (const solution of selectedSolutions) {
      const { likes, dislikes } = solution;
      const PURCHASE_PATENT_APP_POINTS = await CalculateMultiplierIdeapoints(
        likes,
        dislikes,
        IDEAPOINTS.PURCHASE_PATENT_APP_IDEAPOINTS,
      );
      if (response.isPaid) {
        await handleItemsUpdate(
          response.problems,
          COMMON.C_PROBLEM,
          COMMON.PROBLEM,
          PURCHASE_PATENT_APP_POINTS,
          COMMON.CONCEPT_PROBLEM,
        );
      }
    }
    if (response.isPaid) {
      const promises = [
        handleProfileUpdate(
          req.query.userId,
          COMMON.APPLICATION,
          IDEAPOINTS.PURCHASED_PATENT,
          response._id,
          COMMON.PURCHASED_PATENT,
        ),
        handleItemsIdeaPointsUpdate(
          response._id,
          MODALS.APPLICATION,
          IDEAPOINTS.PURCHASED_PATENT,
        ),
        handleItemsIdeaPointsUpdate(
          response.problems,
          MODALS.PROBLEM,
          IDEAPOINTS.CONCEPT_PROBLEM,
        ),
        handleNewNotification(COMMON.CREATE, {
          ownerId: req.query.userId,
          itemType: COMMON.APPLICATION,
          ideaPoints: IDEAPOINTS.PURCHASED_PATENT,
          itemId: response._id,
          actions: [COMMON.PURCHASED_PATENT],
        }),
        handleTagsUpdate(
          response.tags,
          req.query.userId,
          COMMON.L_Tag,
          // eslint-disable-next-line no-undef
          SELECTED_COMMUNITY_IDEAPOINTS,
        ),
        ...tags
          .map((tag) =>
            tag.followers.map((followerId) =>
              handleNewNotification(COMMON.CREATE, {
                ownerId: followerId,
                userId: followerId,
                itemType: COMMON.COMMUNITY,
                ideaPoints: IDEAPOINTS.PURCHASED_PATENT,
                itemId: tag._id,
                actions: [COMMON.PURCHASED_PATENT_APP_COMMUNITY],
              }),
            ),
          )
          .flat(),
      ];
      if (response.selected.length >= 3) {
        promises.push(
          handleItemsUpdate(
            response.selected,
            COMMON.C_SOLUTION,
            COMMON.SOLUTION,
            IDEAPOINTS.CONCEPT_SOLUTION_THREE,
            COMMON.CONCEPT_SOLUTION,
          ),
          handleItemsIdeaPointsUpdate(
            response.selected,
            MODALS.SOLUTION,
            IDEAPOINTS.CONCEPT_SOLUTION_THREE,
          ),
        );
      } else {
        promises.push(
          handleItemsUpdate(
            response.selected,
            COMMON.C_SOLUTION,
            COMMON.SOLUTION,
            IDEAPOINTS.CONCEPT_SOLUTION,
            COMMON.CONCEPT_SOLUTION,
          ),
          handleItemsIdeaPointsUpdate(
            response.selected,
            MODALS.SOLUTION,
            IDEAPOINTS.CONCEPT_SOLUTION,
          ),
        );
      }
      Promise.all(promises).catch((error) =>
        errors.handleError(res, error, ERRORS.ISPAID_IDEAPOINTS, logger),
      );
    }
    res.redirect(redirectTo);
  } catch (err) {
    const owner = await mongoose.model('Profile').findOne({ _id: userId });
    await applicationHelper.clearPayment(id, owner);
    res.redirect(redirectTo);
  }
};

// Remove this in future

// applicationController.checkPay = async (req, res) => {
//   try {
//     const appUrl = getHost(req, true);
//     let redirectUrl = `${appUrl}/applications/${req.params.id}/show`;
//     if (redirects[req.params.id]) {
//       redirectUrl = redirects[req.params.id];
//       delete redirects[req.params.id];
//     }
//     const application = await applicationDal.getOne(req.params.id, {
//       isSuper: true,
//     });
//     if (!application) {
//       res.redirect(redirectUrl);
//       return;
//     }
//     const { products = [] } = application;
//     const product = products.find((i) => i.productId === req.params.payId);
//     if (!product || !product.envelopeId) {
//       res.redirect(redirectUrl);
//       return;
//     }
//     const envelop = await eSign.getEnvelop({
//       appUrl,
//       envelopeId: product.envelopeId,
//     });
//     if (envelop.redirect) {
//       res.redirect(redirectUrl);
//       return;
//     }
//     const isSigned = envelop.status === 'completed';
//     product.status = envelop.status;
//     if (!isSigned) {
//       product.envelopeId = undefined;
//       product.signerClientId = undefined;
//     }
//     await applicationDal.updateInternal(req.params.id, { products });
//     if (isSigned) {
//       await signDocumentDal.create({
//         type: signDocType.APPLICATION_BUY,
//         itemType: activityItem.APPLICATION,
//         itemId: application.id,
//         owner: application.owner,
//         documentId: product.envelopeId,
//       });
//     }

//     res.redirect(redirectUrl);
//   } catch (error) {
//     const message = 'Application pay error';
//     errors.handleError(res, error, message, logger);
//   }
// };

TODO: applicationController.sign = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }
    const { redirect, baseUrl } = req.body || {};
    const host = getHost(req);
    const appUrl = getHost(req, true);
    const redirectUrl = `${appUrl}/inventions/${req.params.id}`;
    const application = await applicationDal.getOne(req.params.id, req.user);
    if (!application) {
      throw new NotFound();
    }
    const owner = await profileDal.getOne(application.owner, req.user);

    if (!application.envelopeId) {
      let termDoc = null;
      if (application.finalizeType === FINALIZE_TYPE.OWN) {
        termDoc = await termDal.getByType(
          termsTemplateType.EXCLUSIVE_APPLICATION,
        );
      } else if (application.isShared) {
        termDoc = await termDal.getByType(termsTemplateType.SHARED_APPLICATION);
      }
      if (!termDoc || !termDoc.documentId) {
        res.json({ redirect: redirectUrl });
        return;
      }
      const signerClientId = new Date().getTime();
      const envelop = await eSign.createEnvelop({
        appUrl,
        signerEmail: owner.email,
        signerName: owner.username,
        signerClientId: signerClientId,
        templateId: termDoc.documentId,
        returnUrl: `${host}/api/applications/${req.params.id}/sign`,
      });
      if (envelop.redirect) {
        res.json({ redirect: envelop.redirect });
        return;
      }
      application.envelopeId = envelop.envelopeId;
      application.signerClientId = signerClientId;
      await applicationDal.updateInternal(req.params.id, {
        envelopeId: application.envelopeId,
        signerClientId: application.signerClientId,
      });
    }
    const link = await eSign.createEnvelopLink({
      appUrl,
      signerEmail: owner.email,
      signerName: owner.username,
      signerClientId: application.signerClientId,
      envelopeId: application.envelopeId,
      returnUrl: `${host}/api/applications/${req.params.id}/sign`,
    });
    if (link.redirect) {
      res.json({ redirect: link.redirect });
      return;
    }
    res.json({ link: link.envelopeLink });
  } catch (error) {
    const message = `Application sign error`;
    errors.handleError(res, error, message, logger);
  }
};

applicationController.checkSign = async (req, res) => {
  try {
    const appUrl = getHost(req, true);
    const redirectUrl = `${appUrl}/inventions/${req.params.id}`;
    const application = await applicationDal.getOne(req.params.id, {
      isSuper: true,
    });
    if (!application || !application.envelopeId) {
      res.redirect(redirectUrl);
      return;
    }
    const envelop = await eSign.getEnvelop({
      appUrl,
      envelopeId: application.envelopeId,
    });
    if (envelop.redirect) {
      res.redirect(redirectUrl);
      return;
    }
    const isSigned = envelop.status === 'completed';
    if (!isSigned) {
      await applicationDal.updateInternal(req.params.id, {
        envelopeId: undefined,
        signerClientId: undefined,
      });
      res.redirect(redirectUrl);
      return;
    }
    await applicationDal.updateInternal(req.params.id, {
      termsAgree: true,
    });
    let type = signDocType.UNKNOWN;
    if (application.finalizeType === FINALIZE_TYPE.OWN) {
      type = signDocType.EXCLUSIVE_APPLICATION;
    } else if (application.isShared) {
      type = signDocType.SHARED_APPLICATION;
    }
    await signDocumentDal.create({
      type,
      itemType: activityItem.APPLICATION,
      itemId: application.id,
      owner: application.owner,
      documentId: application.envelopeId,
    });
    res.redirect(redirectUrl);
  } catch (error) {
    const message = 'Application sign check error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getSitemap = async (req, res) => {
  try {
    res.header('Content-Type', 'application/xml');
    res.header('Content-Encoding', 'gzip');

    const existStream = sitemap.getStaticStream(SITEMAP_NAME);
    if (existStream) {
      existStream.pipe(res).on('error', (e) => {
        throw e;
      });
      return;
    }

    const { stream, write, end } = sitemap.prepareNewStream(SITEMAP_NAME);

    write({ url: '/inventions/', priority: 0.5 });

    await applicationDal.sitemapReindex((obj) => {
      const { id, lastmod, img } = obj;
      write({ url: `/inventions/${id}`, priority: 0.3, lastmod, img });
    });

    end();

    // stream write the response
    stream.pipe(res).on('error', (e) => {
      throw e;
    });
  } catch (e) {
    logger.error(e);
    res.status(500).end();
  }
};

applicationController.getGraph = async (req, res) => {
  try {
    const mapType = req.query.mapType;
    const data = await applicationDal.getGraph(
      req.params.id,
      req.user?.id,
      mapType,
    );
    res.json(data);
  } catch (error) {
    const message = 'Get application graph error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getJackpots = async (req, res) => {
  try {
    const data = await applicationDal.getJackpots(req.params.id);
    res.json(data);
  } catch (error) {
    const message = 'Get application jackpots error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.generateProblemsForApplication = async (req, res) => {
  try {
    const data = await applicationDal.getOne(req.params.id, req.user);
    const creditsHistory = {
      _id: new ObjectId(),
    };
    generationService.generateProblemsForApplication(
      data.title,
      data.id,
      data.key,
      req.body.type,
      req.user.id,
      creditsHistory,
      true,
      data,
    );
    res.json({});
  } catch (error) {
    const message = 'Generate problem for application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.generateSolutionsForApplication = async (req, res) => {
  try {
    const data = await applicationDal.getOne(req.params.id, req.user);

    generationService.generateSolutionsForApplication(
      data.title,
      data.id,
      data.key,
      req.body.type,
      req.body.problemTitle,
      req.body.problemId,
      req.user.id,
      {},
      data,
    );
    res.json({});
  } catch (error) {
    const message = 'Generate problem for application error';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.getConceptImageAndTitle = async (req, res) => {
  try {
    const generateImage = req.query.generateImage
      ? JSON.parse(req.query.generateImage)
      : true;

    const prompt = await applicationDal.createTitlePrompt(
      req.params.id,
      req.user,
    );
    if (!prompt) {
      res.json({ text: '' });
      return;
    }
    if (!req.user) {
      throw new Unauthorized();
    }

    const creditsHistory = {
      _id: new ObjectId(),
      action: generateImage
        ? CREDIT_ACTIONS.GEN_CONCEPT_IMG_AND_TITLE
        : CREDIT_ACTIONS.GEN_TITLE,
      item: req.params.id,
      itemType: MODALS.APPLICATION,
    };

    const app = await mongoose
      .model(MODALS.APPLICATION)
      .findOne({ _id: req?.params?.id })
      .select('_id tags');
    const title = await generateText(
      prompt,
      req.user.id,
      creditsHistory,
      null,
      false,
      app,
    );

    const updatedConcept = await applicationDal.update(
      req.params.id,
      { title },
      req.user,
    );

    if (generateImage) {
      const img = await queueDb.addToQueue(QUEUE_IMAGE_GENERATE_NAME, {
        imageText: title,
        itemId: req.params.id,
        type: COMMON.APPLICATION,
        userId: req.user.id,
        creditsHistory,
        callCreditsPusher: true,
      });
    } else {
      await triggerCreditsPusher(creditsHistory._id, req.user.id);
    }

    res.json({ data: updatedConcept });
  } catch (error) {
    const message = 'Error in title and image generation for the concept';
    errors.handleError(res, error, message, logger);
  }
};

applicationController.generateConceptScore = async (req, res) => {
  try {
    if (!req.user) {
      throw new Unauthorized();
    }

    if (!req.params.id) {
      throw new Error();
    }

    const prompt = await applicationDal.createConceptRankingPrompt(
      req.params.id,
      req.user,
    );

    const creditsHistory = {
      _id: new ObjectId(),
      action: CREDIT_ACTIONS.GEN_CONCEPT_SCORE,
      item: req.params.id,
      itemType: MODALS.APPLICATION,
    };

    const app = await mongoose
      .model(MODALS.APPLICATION)
      .findOne({ _id: req?.params?.id })
      .select('_id tags');
    const score = await generateText(
      prompt,
      req.user.id,
      creditsHistory,
      null,
      false,
      app,
    );

    const cleanedScore = score.replace(/```json\n|\n```/g, '').trim();

    const regex = /([A-Za-z\s]+):\s*(\d+)/g;

    const scoreData = [...cleanedScore.matchAll(regex)].reduce((acc, match) => {
      const key = match[1].trim();
      const formattedKey = key.charAt(0).toLowerCase() + key.slice(1);
      acc[formattedKey] = parseInt(match[2], 10) || 0;
      return acc;
    }, {});

    const {
      performance = 0,
      affordability = 0,
      featurability = 0,
      deliverability = 0,
      usability = 0,
      maintainability = 0,
      durability = 0,
      imageability = 0,
      complexity = 0,
      precision = 0,
      variability = 0,
      sensitivity = 0,
      immaturity = 0,
      danger = 0,
    } = scoreData;

    const highSkillRequirements =
      scoreData[COMMON.HIGH_SKILLS_REQUIREMENTS] ??
      scoreData[COMMON.C_HIGH_SKILLS_REQUIREMENTS] ??
      0;

    const baselineAggregateScore =
      performance +
      affordability +
      featurability +
      deliverability +
      usability +
      maintainability +
      durability +
      imageability -
      complexity -
      precision -
      variability -
      sensitivity -
      immaturity -
      danger -
      highSkillRequirements;

    const updatedConcept = await applicationDal.update(
      req.params.id,
      {
        score: {
          baselineAggregateScore,
          individualScores: {
            performance,
            affordability,
            featurability,
            deliverability,
            usability,
            maintainability,
            durability,
            imageability,
            complexity,
            precision,
            variability,
            sensitivity,
            immaturity,
            danger,
            highSkillRequirements,
          },
        },
      },
      req.user,
    );

    await triggerCreditsPusher(creditsHistory._id, req.user.id);

    res.json({ data: updatedConcept });
  } catch (error) {
    const message = ERRORS.SCORE_GENERATION_ERROR;
    errors.handleError(res, error, message, logger);
  }
};

applicationController.regenerateConceptImage = async (req, res) => {
  try {
    const prompt = await createImagePrompt(req.params.id);
    if (!prompt) {
      res.json({ text: '' });
      return;
    }
    if (!req.user) {
      throw new Unauthorized();
    }

    const creditsHistory = {
      _id: new ObjectId(),
      action: CREDIT_ACTIONS.GEN_CONCEPT_IMG,
      item: req.params.id,
      itemType: MODALS.APPLICATION,
    };

    const application = await mongoose
      .model(MODALS.APPLICATION)
      .findOne({ _id: req?.params?.id })
      .select('_id tags');
    const title = await generateText(
      prompt,
      req.user.id,
      creditsHistory,
      null,
      false,
      application,
    );
    // const imageUrl = await openAi.dallE(title, true);
    const app = await mongoose
      .model(MODALS.APPLICATION)
      .findOne({ id: req?.params?.id })
      .select('_id tags');
    const imageUrl = await getImageFromStableDiffusion(
      title,
      negativePrompt,
      'concepts',
      true,
      true,
      req.user.id,
      creditsHistory,
      app,
    );
    const fileObj = await s3Files.getFileObjFromBase64(imageUrl, 'application');
    const updatedConcept = {
      ...fileObj,
      url: imageUrl,
    };
    await triggerCreditsPusher(creditsHistory._id, req.user.id);

    res.json(updatedConcept);
  } catch (error) {
    const message = 'Error in image generation for the concept';
    errors.handleError(res, error, message, logger);
  }
};

// eslint-disable-next-line no-empty-function
applicationController._send = () => {};

module.exports = applicationController;
