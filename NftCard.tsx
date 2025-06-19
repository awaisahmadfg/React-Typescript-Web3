import React, { useEffect, useReducer, useState } from 'react';
import { Token } from 'interface/common';
import { useDispatch } from 'react-redux';
import {
  GetUser,
  useBuyLoading,
  useCancelLoading,
  useListLoading
} from 'redux-state/selectors';
import { NUMBERS } from 'utilities/constants';
import { NftPlaceBidModal } from 'modals/NftPlaceBidModal';
import { getNftLoadingStates } from './getNftLoadingStates';
import { addDaysToDate } from './utils';
import {
  useIsAnyDrawerOpen,
  useOpenDetailDrawer
} from 'redux-state/nftMarketplace/selector';
import { localReducer } from 'pages/nftListForSale/NftDetailsSection/nftDetailState/reducer';
import { getInitialState } from 'pages/nftListForSale/NftDetailsSection/utils';
import { convertUsdToMatic } from 'helpers/blockchain';
import { renderTxApprovalModal } from 'pages/nftDetails/utils/renderTxApprovalModal';
import { renderListForSaleDetailDrawer } from 'pages/nftDetails/utils/renderListForSaleDrawer';
import { NftCardItem } from './NftCardItem';
import { Box } from '@mui/material';

interface NftCardProps {
  token: Token;
  buttonType: string;
  filters?: any;
  pagination?: any;
  disabled?: boolean;
  isAuctionStarted?: boolean;
  isAuctionExpired?: boolean;
}

export const NftCard: React.FC<NftCardProps> = ({
  buttonType,
  token,
  filters,
  pagination,
  disabled = false,
  isAuctionStarted = false,
  isAuctionExpired = false
}) => {
  const { createdAt, tokenId } = token;
  const dispatch = useDispatch();
  const user = GetUser();
  const buyLoading = useBuyLoading(tokenId);
  const listLoading = useListLoading(tokenId);
  const cancelLoading = useCancelLoading(tokenId);
  const openDetailDrawer = useOpenDetailDrawer(tokenId);
  const isAnyDrawerOpen = useIsAnyDrawerOpen();

  const initialNftDetailState = getInitialState();
  const [showBuyNftApprovalModal, setShowBuyNftApprovalModal] =
    useState<boolean>(false);
  const [showCancelNftApprovalModal, setShowCancelNftApprovalModal] =
    useState<boolean>(false);

  const [openBidModal, setOpenBidModal] = useState<boolean>(false);
  const [maticPrice, setMaticPrice] = useState<number | undefined>(undefined);
  const [listPrice, setListPrice] = useState<number>(0);

  useEffect(() => {
    const fetchMaticConversion = async () => {
      const result = await convertUsdToMatic(listPrice);
      if (result !== undefined) {
        setMaticPrice(Number(result));
      }
    };

    fetchMaticConversion();
  }, [listPrice]);

  const [nftDetailState, localDispatch] = useReducer(
    localReducer,
    initialNftDetailState
  );

  const expiryTimestamp = addDaysToDate(createdAt, NUMBERS.YEAR);
  const currentTime = new Date();
  const isNftExpired = currentTime > expiryTimestamp;

  const loading = getNftLoadingStates(
    buttonType,
    buyLoading,
    listLoading,
    cancelLoading
  );

  return (
    <>
      <Box sx={{ pointerEvents: isAnyDrawerOpen ? 'none' : 'auto' }}>
        <NftCardItem
          token={token}
          expiryTimestamp={expiryTimestamp}
          buttonType={buttonType}
          loading={loading}
          isNftExpired={isNftExpired}
          isAuctionStarted={isAuctionStarted}
          isAuctionExpired={isAuctionExpired}
          disabled={disabled}
          tokenId={tokenId}
          setShowBuyNftApprovalModal={setShowBuyNftApprovalModal}
          setShowCancelNftApprovalModal={setShowCancelNftApprovalModal}
          setOpenBidModal={setOpenBidModal}
        />
      </Box>
      {renderTxApprovalModal(
        showBuyNftApprovalModal,
        showCancelNftApprovalModal,
        token,
        user,
        setShowBuyNftApprovalModal,
        setShowCancelNftApprovalModal,
        dispatch,
        filters,
        pagination
      )}
      {openBidModal && (
        <NftPlaceBidModal
          open={openBidModal}
          setOpen={setOpenBidModal}
          token={token}
        />
      )}
      {renderListForSaleDetailDrawer(
        openDetailDrawer,
        token,
        dispatch,
        listLoading,
        listPrice,
        setListPrice,
        maticPrice,
        localDispatch,
        nftDetailState
      )}
    </>
  );
};
