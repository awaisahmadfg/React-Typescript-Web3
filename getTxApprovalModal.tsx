import { Dispatch } from 'react';
import ListIcon from '@mui/icons-material/List';
import { CircularProgress, Typography } from '@mui/material';
import { Profile } from 'components/CardProfile';
import { MaticToUsd } from 'components/MaticToUsd';
import { auctionEndTransaction } from 'helpers/blockchain';
import { Token } from 'interface/common';
import { StyledLoadingButton } from 'modals/NftPlaceBidModal/ListNftForm/styledComponents';
import { StyledUsdText } from 'modals/NftPlaceBidModal/PriceInputSection/styledComponents';
import moment from 'moment';
import Actions from 'redux-state/actions';
import {
  BUTTON_TYPES,
  Constants,
  ERRORS,
  TRANSACTION_TYPE,
  VARIANT
} from 'utilities/constants';
import { txReject } from '.';
import { claimNFTransaction } from './claimTokenTransaction';
import {
  EventContainer,
  HeaderContainer,
  StyledFromText
} from '../ListingsTable/styledComponents';
import { nftDetailActions } from '../nftDetailState/actions';
import { NftDetailAction, NftDetailState } from '../nftDetailState/interfaces';
import { SubText } from '../styledComponents';

const WALLET_ADDRESS_LENGTH = 5;

export function getTxApprovalModalProps({
  localDispatch,
  nftDetailState,
  dispatch,
  nft,
  txApprovalModalObj,
  user,
  bidOffers
}) {
  // eslint-disable-next-line
  console.log("Entry in getTxApprovalModalProps ", bidOffers);
  if (nftDetailState.showNftApprovalModal) {
    switch (nftDetailState.buttonType) {
      case BUTTON_TYPES.ACCEPT:
        return {
          show: nftDetailState.showNftApprovalModal,
          onConfirm: () =>
            acceptApprovalTransaction(
              user,
              nft,
              nftDetailState,
              localDispatch,
              dispatch,
              bidOffers
            ),
          onReject: () => txReject(localDispatch, dispatch),
          transactionType: TRANSACTION_TYPE.ACCEPT_OFFER,
          open: txApprovalModalObj.open,
          type: txApprovalModalObj.type
        };

      case BUTTON_TYPES.CLAIM:
        return {
          show: nftDetailState.showNftApprovalModal,
          onConfirm: () =>
            claimNFTransaction(user, nft, localDispatch, dispatch),
          onReject: () => txReject(localDispatch, dispatch),
          transactionType: TRANSACTION_TYPE.CLAIM_NFT,
          open: txApprovalModalObj.open,
          type: txApprovalModalObj.type
        };

      default:
        break;
    }
  }
  return { show: false };
}

const acceptApprovalTransaction = async (
  user: Profile,
  token: Token,
  nftDetailState: NftDetailState,
  localDispatch: Dispatch<NftDetailAction>,
  dispatch,
  bidOffers
) => {
  // eslint-disable-next-line
  console.log("Entry in acceptApprovalTransaction ", bidOffers);
  localDispatch(nftDetailActions.setState({ isLoading: true }));
  dispatch(Actions.setModalClosable(false));
  localDispatch(nftDetailActions.setState({ showNftApprovalModal: false }));

  dispatch(
    Actions.openTxApprovalModal({
      txApprovalModalObj: {
        open: false,
        gasFee: '',
        type: ''
      }
    })
  );

  try {
    auctionEndTransaction(user.privateKey, token.tokenId, dispatch, bidOffers);
    dispatch(Actions.setModalClosable(true));
    // const { from, to, transactionHash } = response.data;
    // dispatch(
    //   Actions.updateUserNfts({
    //     id: token._id,
    //     data: {
    //       isListed: false,
    //       onAuction: false,
    //       maticPrice: null,
    //       usdPrice: null,
    //       owner: nftDetailState.bidOwner,
    //       expiryDate: null,
    //       auctionStartTime: null,
    //       event: NFT_EVENTS.ACCEPT
    //     },
    //     activity: {
    //       nft: token._id,
    //       from,
    //       to,
    //       event: TRANSACTION_TYPE.ACCEPT_OFFER,
    //       price: null,
    //       txHash: transactionHash
    //     },
    //     getUserNftsPayload: {}
    //   })
    // );
    // dispatch(Actions.deleteBids({ tokenId: token._id }));

    // localDispatch(
    //   nftDetailActions.setState({
    //     networkResponse: {
    //       status: Constants.COMPLETE_STATUS,
    //       message: (
    //         <StyledParagraph>
    //           {Constants.YOUR_NFT_LISTED_TEXT}{' '}
    //           <StyledLink
    //             href={`${sepolia.blockExplorerUrl}/${Constants.TX}/${response.data.transactionHash}`}
    //             target="_blank"
    //             rel="noopener noreferrer"
    //           >
    //             {Constants.VIEW_TRANSACTION}
    //           </StyledLink>
    //         </StyledParagraph>
    //       )
    //     }
    //   })
    // );

    localDispatch(nftDetailActions.setState({ bidOwner: null }));
    localDispatch(nftDetailActions.setState({ buttonType: null }));
    localDispatch(nftDetailActions.setState({ isLoading: false }));
  } catch (error) {
    localDispatch(
      nftDetailActions.setState({
        networkResponse: {
          status: 'error',
          message: ERRORS.TRANSACTION_FAILED
        }
      })
    );
    localDispatch(nftDetailActions.setState({ buttonType: null }));
    localDispatch(nftDetailActions.setState({ isLoading: false }));
    localDispatch(nftDetailActions.setState({ bidOwner: null }));
  }
};

export const Header = () => {
  return (
    <HeaderContainer>
      <ListIcon sx={{ width: '1.1875rem', height: '1.1875rem' }} />
      <SubText>{Constants.OFFERS}</SubText>
    </HeaderContainer>
  );
};

export const getOfferCells =
  ({
    userId,
    nftOwner,
    handleAcceptOfferClick,
    nftDetailState,
    expiryDate,
    auctionExpiry
  }: any) =>
  (item: any, index: number) => {
    const isUser = item?.userId?.id === userId;
    const walletAddress = item?.userId?.walletAddress.slice(
      -WALLET_ADDRESS_LENGTH
    );
    const currentDate = new Date();
    const isAuctionExpired = new Date(auctionExpiry) <= currentDate;
    const isLoading = nftDetailState.isLoading;
    return {
      matic: (
        <EventContainer>
          <Typography>{item?.maticPrice}</Typography>
        </EventContainer>
      ),
      usdPrice: (
        <StyledUsdText>
          {item?.usdPrice > 0 && <MaticToUsd price={item?.usdPrice} />}
        </StyledUsdText>
      ),
      provisionalExpiry: <Typography>{expiryDate}</Typography>,
      expiration: (
        <Typography>
          {moment(new Date(auctionExpiry)).format('MMMM D, YYYY [at] h:mm A')}
        </Typography>
      ),
      from: (
        <StyledFromText>
          {isUser ? Constants.YOU : walletAddress}
        </StyledFromText>
      ),
      acceptButton: nftOwner === userId && index === 0 && !isAuctionExpired && (
        <StyledLoadingButton
          variant={VARIANT.CONTAINED}
          loading={isLoading}
          onClick={() => handleAcceptOfferClick(item?.userId?.id)}
          disabled={isLoading}
          loadingIndicator={<CircularProgress size={24} color="inherit" />}
        >
          Accept
        </StyledLoadingButton>
      )
    };
  };
