/* eslint-disable no-console */
const staticStageData = (invitation) => {
  const inviterName = invitation.invitedBy.username;
  const inventionName = invitation.dynamicTemplateData.inventionName;

  return {
    2: {
      title: 'Sell Rights, Earn Royalties',
      subject: `${inviterName}: Sell the Rights, Earn the Royalties 💎`,
    },
    3: {
      title: 'Commission Grows in Value',
      subject: `${inviterName}: Why this commission grows in value 📈`,
    },
    4: {
      title: 'AI Sales Materials Ready',
      subject: `${inviterName}: AI-generated sales materials included 🎥`,
    },
    5: {
      title: 'Target Buyer Audience',
      subject: `${inviterName}: Who wants to buy ${inventionName}?`,
    },
    6: {
      title: 'Join the IP Economy',
      subject: `${inviterName}: Join the IP Economy 🌐`,
    },
    7: {
      title: 'Only One Buyer Takes Rights',
      subject: `${inviterName}: Only one buyer takes the rights (and you get part of the sale!)`,
    },
    8: {
      title: 'Corporate Buyback Strategy',
      subject: `${inviterName}: A Company might buy this automatically 🏢`,
    },
    9: {
      title: 'Waiting for Offers',
      subject: `${inviterName} is waiting for offers`,
    },
    10: {
      title: 'Last Chance to Broker',
      subject: `${inviterName}: Last chance to broker ${inventionName} ⏳`,
    },
  };
};

const getNftInfluencerInviteData = async (invitation) => {
  const stage = invitation?.currentStage + 1;
  const stageData = staticStageData(invitation)[stage] || {};

  return {
    ...invitation.dynamicTemplateData,
    ...stageData,
    stage,
  };
};

module.exports = {
  getNftInfluencerInviteData,
};
