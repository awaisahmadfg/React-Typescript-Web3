import React from 'react';
import { Constants } from 'utilities/constants';
import {
  StyledSummaryTotalEarningsSubTypography,
  StyledSummaryTotalEarningsTypography
} from './styledComponents';
import { StyledSummaryTotalEarningsBox } from '../styledComponents';
import { colorPalette } from 'theme';
import { Box } from '@mui/material';

interface TotalEarningsProps {
  totalEarnings: number;
  isMediumScreen: boolean;
}

const TotalEarnings: React.FC<TotalEarningsProps> = ({
  totalEarnings,
  isMediumScreen
}) => {
  return (
    <StyledSummaryTotalEarningsBox>
      <StyledSummaryTotalEarningsTypography isMediumScreen={isMediumScreen}>
        {Constants.TOTAL_EARNINGS_TEXT}
      </StyledSummaryTotalEarningsTypography>
      <StyledSummaryTotalEarningsSubTypography isMediumScreen={isMediumScreen}>
        <Box component="span" sx={{ color: colorPalette.eucalyptusGreen }}>
          {totalEarnings
            ? `${Constants.USD_SYMBOL}${Number(totalEarnings).toFixed(4)}`
            : '--'}
        </Box>{' '}
        <Box
          component="span"
          sx={{ color: colorPalette.white, fontWeight: 500 }}
        >
          {Constants.USD}
        </Box>
      </StyledSummaryTotalEarningsSubTypography>
    </StyledSummaryTotalEarningsBox>
  );
};

export default TotalEarnings;
