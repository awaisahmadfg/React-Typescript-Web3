import React, { useCallback, useEffect, useReducer } from 'react';
import { useDispatch } from 'react-redux';
import { Box, CircularProgress } from '@mui/material';
import { IoMdArrowBack } from 'react-icons/io';
import { openTransakBuyModalFunc } from 'helpers';
import useRouter from 'hooks/useRouter';
import Actions from 'redux-state/actions';
import {
  GetNft,
  GetNftLoader,
  GetOpenTransakBuyModalObj,
  GetUser
} from 'redux-state/selectors';
import {
  useBuyNftSuccess,
  useBuyNftSuccessContext
} from 'redux-state/nftMarketplace/selectors';
import * as NftActions from 'redux-state/nftMarketplace/actions';
import PopUpModal from 'modals/PopUpModal';
import SuccessIcon from 'assets/icons/SuccessIcon.svg';
import { Constants } from 'utilities/constants';
import { colorPalette } from 'theme';
import { DescriptionSection } from './DescriptionSection';
import { useFetchNftMetadata } from './DescriptionSection/hooks/useFetchNftMetadata';
import { TraitsAccordion } from './DescriptionSection/TraitsAccordion';
import { DetailsSection } from './DetailsSection';
import { ListingsTable } from './ListingsTable';
import { OffersSection } from './OffersSection';
import PriceHistory from './PriceHistory';
import { PriceSection } from './PriceSection';
import {
  CenterBox,
  Column1,
  Column2,
  Container,
  StyledSectionOne
} from './styledComponents';
import NftActivity from '../components/NftActivity';
import { localReducer } from './nftDetailState/reducer';
import { getInitialState } from '../nftListForSale/NftDetailsSection/utils';
import { setCookie } from 'helpers/common';

function getBackNav(from: string | string[] | undefined) {
  const isMarketplace = from === 'marketplace';
  return {
    backTab: isMarketplace ? 'marketplace' : 'my-collections',
    backLabel: isMarketplace
      ? Constants.C_MARKETPLACE
      : Constants.MY_COLLECTIONS
  };
}

export const NftDetails = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const openTransakBuyModal = GetOpenTransakBuyModalObj();
  const { id, referralCode, from } = router.query;
  const { backTab, backLabel } = getBackNav(from);
  const getNftLoader = GetNftLoader();
  const nft = GetNft();
  const user = GetUser();
  const { metadata } = useFetchNftMetadata(nft?.URI);
  const initialNftDetailState = getInitialState();
  const [nftDetailState, localDispatch] = useReducer(
    localReducer,
    initialNftDetailState
  );
  const buySuccessModalOpen = useBuyNftSuccess();
  const buySuccessModalContext = useBuyNftSuccessContext();

  useEffect(() => {
    dispatch(Actions.getNft({ id }));
  }, [dispatch, id]);

  useEffect(() => {
    if (openTransakBuyModal?.open) {
      openTransakBuyModalFunc(user?.walletAddress, dispatch);
    }
  }, [openTransakBuyModal?.open, user?.walletAddress, dispatch]);

  useEffect(() => {
    if (referralCode) setCookie('referralCode', referralCode);
  }, [referralCode]);

  const handleCloseBuyModal = useCallback(() => {
    dispatch(NftActions.closeBuyNftSuccessModal());
  }, [dispatch]);

  const handleBackClick = useCallback(() => {
    router.push(`/marketplace?tab=${backTab}`);
  }, [router, backTab]);

  if (!nft || getNftLoader) {
    return (
      <CenterBox>
        <CircularProgress />
      </CenterBox>
    );
  }

  return (
    <Box sx={{ padding: '1.25rem' }}>
      <Box
        role="breadcrumbs"
        onClick={handleBackClick}
        sx={{
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          width: 'fit-content',
          transition: 'opacity 0.2s ease-in-out',
          '&:hover': {
            opacity: 0.8
          }
        }}
      >
        <IoMdArrowBack
          size={20}
          style={{ color: colorPalette.white, marginRight: '0.5rem' }}
        />
        <Box
          component="span"
          sx={{
            color: colorPalette.white,
            fontFamily: 'urbanist',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          Back to {backLabel}
        </Box>
      </Box>
      <Container>
        <PriceSection
          nftDetailState={nftDetailState}
          localDispatch={localDispatch}
        />
        <StyledSectionOne role="Section1">
          <Column1>
            <DescriptionSection nft={nft} />
            <TraitsAccordion metadata={metadata} />
            <DetailsSection nft={nft} />
          </Column1>

          <Column2>
            {nft.isListed && <PriceHistory />}
            {nft.isListed && <ListingsTable nft={nft} />}
            {nft.isListed && <OffersSection nft={nft} />}
          </Column2>
        </StyledSectionOne>

        <Box role="Section2">{nft && <NftActivity nft={nft} />}</Box>
      </Container>
      {buySuccessModalOpen && buySuccessModalContext === 'nftDetail' && (
        <PopUpModal
          onClose={handleCloseBuyModal}
          open={buySuccessModalOpen}
          icon={<img src={SuccessIcon} />}
          title={Constants.YOUR_NFT_HAS_BEEN_PURCHASED}
          subtitle={Constants.SUCCESS}
          buttonText={Constants.VIEW_NFT_TEXT}
          onButtonClick={() => {
            handleCloseBuyModal();
            router.push(`/marketplace?tab=${backTab}`);
          }}
        />
      )}
    </Box>
  );
};
