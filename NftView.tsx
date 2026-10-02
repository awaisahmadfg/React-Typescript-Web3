import React from 'react';
import { CircularProgress, Grid } from '@mui/material';
import { Constants } from 'utilities/constants';
import { WalletNftCard } from '../NftCard';
import { NotFoundText, CenterBox, StyledGrid } from '../styledComponents';
import { useFetchNfts } from '../hooks/useFetchNfts';

export const NftView: React.FC = () => {
  const { nfts, loading } = useFetchNfts();

  return (
    <>
      {loading && (
        <CenterBox>
          <CircularProgress />
        </CenterBox>
      )}
      {!loading && !nfts.length && (
        <NotFoundText>{Constants.NO_NFT_MINTED}</NotFoundText>
      )}
      {nfts.length > 0 && (
        <StyledGrid container spacing={1.5}>
          {nfts.map((nft) => (
            <Grid
              item
              xs={12}
              sm={4}
              md={4}
              lg={4}
              key={String(nft.id ?? nft._id ?? nft.tokenId)}
            >
              <WalletNftCard nft={nft} />
            </Grid>
          ))}
        </StyledGrid>
      )}
    </>
  );
};
