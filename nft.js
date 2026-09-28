const mongoose = require('mongoose');
const { MODALS } = require('../consts');

const nftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    owner: {
      type: mongoose.Schema.ObjectId,
      ref: MODALS.PROFILE,
    },
    tags: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Tag',
      },
    ],
    company: {
      type: mongoose.Schema.ObjectId,
      ref: 'Tag',
      default: null,
    },
    tokenId: {
      type: String,
    },
    URI: {
      type: String,
    },
    isListed: {
      type: Boolean,
      default: false,
    },
    onAuction: {
      type: Boolean,
      default: false,
    },
    maticPrice: {
      type: Number,
    },
    promotionVideoUrl: {
      type: String,
    },
    promotionVideoType: {
      type: String,
      default: 'video',
    },
    promotionVideoIsProcessing: {
      type: Boolean,
      default: false,
    },
    usdPrice: {
      type: Number,
    },
    invention: {
      type: mongoose.Schema.ObjectId,
      ref: MODALS.APPLICATION,
    },
    expiryDate: {
      type: Date,
    },
    isExpired: {
      type: Boolean,
      default: false,
    },
    auctionStartTime: {
      type: Date,
    },
    paymentToken: {
      type: String,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

nftSchema.set('toJSON', {
  virtuals: true,
});

const NFT = mongoose.model('Nft', nftSchema);

module.exports = {
  nftSchema,
  NFT,
};
