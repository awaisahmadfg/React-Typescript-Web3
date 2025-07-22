const { default: mongoose } = require('mongoose');
const { HTTP_STATUS, MODALS, NFT_EVENTS } = require('../consts');
const { nftDal } = require('../dal');
const { QUEUE_NFT_EMAILS, queueDb } = require('../helpers/queueDb');
const {
  sendNftListingEmail,
  sendNftBuyerEmail,
  sendNftSellerEmail,
  sendNftExpiryEmail,
} = require('../helpers/nft');
const nodeCron = require('node-cron');

const nftController = {};

nftController.getList = async (req, res) => {
  try {
    const sort = req?.query?.sort ? JSON.parse(req?.query?.sort) : null;
    const range = req?.query?.range ? JSON.parse(req?.query?.range) : null;
    const filter = req?.query?.filter ? JSON.parse(req?.query?.filter) : null;

    const data = await nftDal.getList({ sort, range, filter }, req.user);
    const responseData = { data };
    res.json(responseData);
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(error);
  }
};

nftController.getOne = async (req, res) => {
  try {
    const data = await nftDal.getOne(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(error);
  }
};

nftController.getOneByKey = async (req, res) => {
  try {
    const data = await nftDal.getOneByKey(req.params.key, req.user);
    res.json(data);
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(error);
  }
};

nftController.create = async (req, res) => {
  try {
    const data = req.body;
    const nft = nftDal.create(data);
    res.json(nft);
  } catch (error) {
    res
      .status(error?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .send(error.message);
  }
};

nftController.update = async (req, res) => {
  try {
    const originalNft = await mongoose
      .model(MODALS.NFT)
      .findOne({ _id: req.params.id });
    const data = await nftDal.update(req.params.id, req.body, req.user);
    const { event = null } = req.body;
    const { owner: originalOwner } = originalNft;
    const { owner, id, name, invention } = data;
    const ownerInfo = await mongoose
      .model(MODALS.PROFILE)
      .findOne({ _id: owner });

    if (event === NFT_EVENTS.BUY) {
      const originalOwnerInfo = await mongoose
        .model(MODALS.PROFILE)
        .findOne({ _id: originalOwner });

      queueDb.addToQueue(QUEUE_NFT_EMAILS, {
        email: ownerInfo.email,
        username: ownerInfo.username,
        websiteUrl: `${process.env.CLIENT_HOST}/marketplace/${id}`,
        inventionTitle: name,
        inventionUrl: `${process.env.CLIENT_HOST}/inventions/${invention}`,
        ownerUrl: `${process.env.CLIENT_HOST}/profiles/${originalOwnerInfo.key}`,
      });

      queueDb.createWorker(QUEUE_NFT_EMAILS, async (item) => {
        await sendNftBuyerEmail(item.data);
      });

      queueDb.addToQueue(QUEUE_NFT_EMAILS, {
        email: originalOwnerInfo.email,
        username: originalOwnerInfo.username,
        websiteUrl: `${process.env.CLIENT_HOST}/marketplace/${id}`,
        inventionTitle: name,
        inventionUrl: `${process.env.CLIENT_HOST}/inventions/${invention}`,
      });

      queueDb.createWorker(QUEUE_NFT_EMAILS, async (item) => {
        await sendNftSellerEmail(item.data);
      });
    }

    if (event === NFT_EVENTS.LIST) {
      queueDb.addToQueue(QUEUE_NFT_EMAILS, {
        email: ownerInfo.email,
        username: ownerInfo.username,
        websiteUrl: `${process.env.CLIENT_HOST}/marketplace/${id}`,
        inventionTitle: name,
        inventionUrl: `${process.env.CLIENT_HOST}/inventions/${invention}`,
      });
      queueDb.createWorker(QUEUE_NFT_EMAILS, async (item) => {
        await sendNftListingEmail(item.data);
      });
    }

    res.json(data);
  } catch (error) {
    res
      .status(error?.status || HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .send(error.message);
  }
};

nodeCron.schedule('0 0 * * *', async () => {
  const nfts = await mongoose.model(MODALS.NFT).find({ isExpired: false });
  const currentDate = new Date();

  nfts.map(async (nft) => {
    const expiryDate = new Date(nft?.expiryDate);

    if (currentDate >= expiryDate && !nft.isExpired) {
      const res = await mongoose
        .model(MODALS.NFT)
        .findOneAndUpdate(
          { _id: nft._id },
          { isExpired: true },
          { new: true, upsert: false },
        );

      const owner = await mongoose
        .model(MODALS.PROFILE)
        .findOne({ _id: res.owner });
      const listedNfts = await mongoose
        .model(MODALS.NFT)
        .find({ isExpired: false, isListed: true });

      queueDb.addToQueue(QUEUE_NFT_EMAILS, {
        email: owner.email,
        username: owner.username,
        websiteUrl: `${process.env.CLIENT_HOST}/marketplace/${res._id}`,
        inventionTitle: res.name,
        inventionUrl: `${process.env.CLIENT_HOST}/inventions/${res.invention}`,
        listedNfts: listedNfts,
        aiAgentUrl: `${process.env.CLIENT_HOST}`,
      });

      queueDb.createWorker(QUEUE_NFT_EMAILS, async (item) => {
        await sendNftExpiryEmail(item.data);
      });
    }
  });
});

module.exports = nftController;
