import { Dispatch } from 'react';
import { Constants } from 'utilities/constants';
import { nftDetailActions } from '../nftDetailState/actions';
import { NftDetailAction, NftDetailState } from '../nftDetailState/interfaces';
export {
  handleListNftAuctionApproval,
  handleListNftApproval,
  txReject,
  handleCloseModal,
  handleCompleteListing
} from './handleListApprovals';

export const SIXTY = 60;
export const ONE_THOUSAND = 1000;
const TWENTY_FOUR = 24;
const THREE = 3;
export const SIX = 6;
const SEVEN = 7;

const ONE_HOUR = SIXTY * SIXTY * ONE_THOUSAND;
const SIX_HOURS = SIX * SIXTY * SIXTY * ONE_THOUSAND;
const ONE_DAY = TWENTY_FOUR * SIXTY * SIXTY * ONE_THOUSAND;
const THREE_DAYS = THREE * TWENTY_FOUR * SIXTY * SIXTY * ONE_THOUSAND;
const SEVEN_DAYS = SEVEN * TWENTY_FOUR * SIXTY * SIXTY * ONE_THOUSAND;
const ONE_MONTH = 1;
const THREE_MONTHS = 3;
const SIX_MONTHS = 6;

export const handleDurationSelect = (
  value: string,
  localDispatch: Dispatch<NftDetailAction>
) => {
  localDispatch(nftDetailActions.setState({ datePickerOpen: false }));
  const currentDate = new Date(
    new Date().getTime() + SIX * SIXTY * ONE_THOUSAND
  );
  localDispatch(nftDetailActions.setState({ startDate: currentDate }));

  let calculatedEndDate: Date;
  switch (value) {
    case Constants.ONE_HOUR_TEXT:
      calculatedEndDate = new Date(currentDate.getTime() + ONE_HOUR);
      break;
    case Constants.SIX_HOURS_TEXT:
      calculatedEndDate = new Date(currentDate.getTime() + SIX_HOURS);
      break;
    case Constants.ONE_DAY_TEXT:
      calculatedEndDate = new Date(currentDate.getTime() + ONE_DAY);
      break;
    case Constants.THREE_DAYS_TEXT:
      calculatedEndDate = new Date(currentDate.getTime() + THREE_DAYS);
      break;
    case Constants.SEVEN_DAYS_TEXT:
      calculatedEndDate = new Date(currentDate.getTime() + SEVEN_DAYS);
      break;
    case Constants.ONE_MONTH_TEXT:
      calculatedEndDate = new Date(
        new Date(currentDate).setMonth(currentDate.getMonth() + ONE_MONTH)
      );
      break;
    case Constants.THREE_MONTHS_TEXT:
      calculatedEndDate = new Date(
        new Date(currentDate).setMonth(currentDate.getMonth() + THREE_MONTHS)
      );
      break;
    case Constants.SIX_MONTHS_TEXT:
      calculatedEndDate = new Date(
        new Date(currentDate).setMonth(currentDate.getMonth() + SIX_MONTHS)
      );
      break;
    default:
      calculatedEndDate = currentDate;
      break;
  }

  localDispatch(nftDetailActions.setState({ endDate: calculatedEndDate }));
};

export const getInitialState = () => {
  const initialChatState: NftDetailState = {
    startDate: new Date(new Date().getTime() + SIX * SIXTY * ONE_THOUSAND),
    datePickerOpen: false,
    endDate: new Date(new Date().getTime() + ONE_HOUR),
    dropDownOpen: false,
    saleType: Constants.FIXED,
    showDuration: false,
    errorMessage: 'null',
    isLoading: false,
    maticPrice: 0,
    showListNftApprovalModal: false,
    showNftApprovalModal: false,
    networkResponse: { status: null, message: '' },
    openSuccessModal: false
  };

  return initialChatState;
};
