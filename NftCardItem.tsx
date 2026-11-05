/* eslint-disable */
import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRedirectToAuthPage } from 'helpers';
import useRouter from 'hooks/useRouter';
import { Token } from 'interface/common';
import { Tag } from 'components/CardTag';
import {
  closeAllListDetailDrawers,
  setOpenListDetailDrawer
} from 'redux-state/nftMarketplace/actions';
import { GetUser } from 'redux-state/selectors';
import {
  Constants,
  NUMBERS,
  BUTTON_TYPES,
  USER_ROLES
} from 'utilities/constants';
import { handleBookmarkClick } from 'helpers/common';
import { BookmarkButton } from 'components/common/EntityDetails/BookmarkButton';
import { handleButtonClick } from './handleButtonClick';
import { NftInfo } from './NftInfo';
import {
  StyledCard,
  StyledCardContent,
  StyledCardMedia
} from './styledComponents';
import { NftCardButton } from '../NftCardButton/NftCardButton';
import { CrowdfundStakingButton } from './CrowdfundStakingButton';
import { CampaignWarningModal } from 'components/common/CampaignWarningModal';
import { NftListLockMessage } from 'components/common/NftListLockMessage';
import { isNftListLocked } from './utils';
import { NftCardTimerRow } from './nftExpirationUtils';
import { getCardStatus, StatusPill, ViewTokenButton } from './CardStatus';
import { Box } from '@mui/material';
import { sameId } from 'helpers/sameId';

interface NftCardItemProps {
  tag?: Tag | null;
  token: Token;
  cardTimers: NftCardTimerRow[];
  buttonType: string;
  loading: boolean;
  isNftExpired: boolean;
  isAuctionNotStarted: boolean;
  isAuctionExpired: boolean;
  isOwnedView?: boolean;
  isAvailableView?: boolean;
  selectedWallet?: string | null;
  disabled: boolean;
  tokenId: string;
  setOpenBidModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowBuyNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCancelNftApprovalModal: React.Dispatch<React.SetStateAction<boolean>>;
  onQuotationRequestWarning?: () => void;
  openInfluencerDrawer?: boolean;
  setOpenInfluencerDrawer?: React.Dispatch<React.SetStateAction<boolean>>;
  setEntity?: React.Dispatch<React.SetStateAction<Token>>;
  fromTab?: 'marketplace' | 'my-collections';
}

const getInventionId = (
  invention:
    | string
    | { id?: string | number; _id?: string | number }
    | undefined
): string | number | undefined => {
  if (!invention) return undefined;
  if (typeof invention === 'string') return invention;
  return invention.id || invention._id;
};

const shouldShowButtonForCommunity = (
  pathname: string,
  isOwnedView: boolean,
  isAvailableView: boolean,
  tokenCreatedAt: Date | undefined,
  isOwnerOfWorkplace: boolean
): boolean => {
  if (!pathname.includes(Constants.COMMUNITIES)) return false;
  if (isOwnedView || !isAvailableView) return false;

  if (!tokenCreatedAt) return true;

  const sixMonthsAgo = new Date(
    new Date().setMonth(new Date().getMonth() - NUMBERS.SIX)
  );
  const isRecent = new Date(tokenCreatedAt) > sixMonthsAgo;

  return isRecent ? isOwnerOfWorkplace : true;
};

export const NftCardItem: React.FC<NftCardItemProps> = ({
  tag,
  token,
  cardTimers,
  buttonType,
  loading,
  isNftExpired,
  isAuctionNotStarted,
  isAuctionExpired,
  isOwnedView = false,
  isAvailableView = false,
  disabled,
  tokenId,
  setShowBuyNftApprovalModal,
  setShowCancelNftApprovalModal,
  setOpenBidModal,
  onQuotationRequestWarning,
  selectedWallet,
  openInfluencerDrawer = false,
  setOpenInfluencerDrawer = null,
  setEntity = null,
  fromTab
}) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = GetUser();
  const [showDateModal, setShowDateModal] = useState<boolean>(false);
  const isOwnerOfWorkplace = !!token?.tags?.some(
    (tag) => tag?.type === 'workplace' && sameId(tag?.owner, user)
  );
  const redirectToAuthPage = useRedirectToAuthPage();

  const [isBookmarked, setIsBookmarked] = useState<boolean>(
    token?.isBookmarked
  );

  useEffect(() => {
    setIsBookmarked(token?.isBookmarked);
  }, [token?.isBookmarked]);

  const onBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      redirectToAuthPage(router.location.pathname);
      return;
    }
    const previousState = isBookmarked;
    setIsBookmarked(!previousState);
    try {
      await handleBookmarkClick(token, 'nft', previousState, dispatch);
    } catch (e) {
      setIsBookmarked(previousState);
    }
  };

  const shouldShowButton = shouldShowButtonForCommunity(
    router.pathname,
    isOwnedView,
    isAvailableView,
    token?.createdAt,
    isOwnerOfWorkplace
  );

  const handleCardClick = (e: React.MouseEvent) => {
    if (showDateModal) {
      e.stopPropagation();
      return;
    }
    if (
      user?.roles?.includes(USER_ROLES.INFLUENCER) &&
      (setEntity || setOpenInfluencerDrawer)
    ) {
      setEntity?.(token);
      setOpenInfluencerDrawer?.(!openInfluencerDrawer);
      return;
    }
    dispatch(closeAllListDetailDrawers());
    dispatch(setOpenListDetailDrawer(tokenId, false));
    const fromQuery = fromTab ? `?from=${fromTab}` : '';
    router.push(`/${Constants.MARKETPLACE}/${token._id}${fromQuery}`);
  };

  const handleButtonClickWrapper = () => {
    if (
      buttonType === 'List' &&
      isNftListLocked(token, user?.id, user?.employer)
    ) {
      setShowDateModal?.(true);
      return;
    }
    handleButtonClick(buttonType, user, dispatch, token, tokenId, router, {
      setShowBuyNftApprovalModal,
      setShowCancelNftApprovalModal,
      setOpenBidModal,
      redirectToAuthPage,
      onQuotationRequestWarning,
      selectedWallet
    });
  };

  const showCrowdfundButton =
    buttonType === BUTTON_TYPES.LIST && !token.isListed && token.invention;
  const inventionId = showCrowdfundButton
    ? getInventionId(token.invention)
    : undefined;

  const showButtons =
    router.pathname.includes(Constants.MARKETPLACE) || shouldShowButton;

  // Status lives in a pill on the image; the button only offers an action.
  const cardStatus = getCardStatus({
    token,
    isNftExpired,
    isAuctionNotStarted,
    isAuctionExpired
  });
  const isOwnerAction =
    buttonType === BUTTON_TYPES.CANCEL || buttonType === BUTTON_TYPES.LIST;
  const nothingToBuy =
    !isOwnerAction && (isNftExpired || (token.onAuction && isAuctionExpired));

  return (
    <StyledCard onClick={handleCardClick}>
      <Box sx={{ position: 'relative', width: '100%' }}>
        <StyledCardMedia image={token.image} />
        <StatusPill status={cardStatus} />
        <BookmarkButton
          onClick={onBookmark}
          isBookmarked={isBookmarked}
          itemType="nft"
          sx={{
            position: 'absolute',
            bottom: '0.5rem',
            right: '0.5rem',
            width: '2.5rem',
            height: '2.5rem',
            minWidth: '2.5rem'
          }}
        />
      </Box>
      <StyledCardContent>
        <NftInfo token={token} cardTimers={cardTimers} variant="card" />
        {showButtons && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              marginTop: 'auto',
              width: '100%'
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                flexGrow: 1
              }}
            >
              {nothingToBuy ? (
                <ViewTokenButton onClick={handleCardClick} />
              ) : (
                <NftCardButton
                  token={token}
                  buttonType={buttonType}
                  loading={loading}
                  onClick={handleButtonClickWrapper}
                  disabled={disabled}
                  isExpired={isNftExpired}
                  isAuctionNotStarted={isAuctionNotStarted}
                  isAuctionExpired={isAuctionExpired}
                  onQuotationRequestWarning={onQuotationRequestWarning}
                />
              )}
              {showCrowdfundButton && inventionId && (
                <CrowdfundStakingButton inventionId={inventionId} />
              )}
            </Box>
          </Box>
        )}
      </StyledCardContent>
      <CampaignWarningModal
        open={showDateModal}
        onClose={() => setShowDateModal?.(false)}
        title={Constants.NFT_LIST_LOCKED_TITLE}
        message={<NftListLockMessage token={token} />}
      />
    </StyledCard>
  );
};
