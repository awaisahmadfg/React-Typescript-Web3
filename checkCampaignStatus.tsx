import { Application, Token } from 'interface/common';

const getCampaignStatus = (
  crowdfundingCampaign: Application['crowdfundingCampaign']
): string | null => {
  if (!crowdfundingCampaign) return null;
  const campaign =
    typeof crowdfundingCampaign === 'object' ? crowdfundingCampaign : null;
  return campaign?.status || null;
};

const isCampaignFulfilled = (
  crowdfundingCampaign: Application['crowdfundingCampaign']
): boolean => {
  const status = getCampaignStatus(crowdfundingCampaign);
  return status === 'Fulfilled';
};

export const hasQuotationRequest = (nft: Token): boolean => {
  if (!nft?.invention) return false;

  const invention =
    typeof nft.invention === 'object' ? (nft.invention as Application) : null;

  if (!invention) return false;

  // Check campaign status first - if "Fulfilled", allow listing (don't show warning)
  if (isCampaignFulfilled(invention.crowdfundingCampaign)) {
    return false;
  }

  // Block if quotation request or accepted quotation exists
  if (invention.quotationRequest || invention.acceptedQuotation) {
    return true;
  }

  // Block if campaign exists and is NOT fulfilled
  const campaignStatus = getCampaignStatus(invention.crowdfundingCampaign);
  if (campaignStatus && campaignStatus !== 'Fulfilled') {
    return true;
  }

  return false;
};
