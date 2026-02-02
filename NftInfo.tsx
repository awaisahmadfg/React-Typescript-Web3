import { useTimer } from 'react-timer-hook';
import { Tooltip } from '@mui/material';
import { Constants, NUMBERS, VARIANT } from 'utilities/constants';
import { CardNameText } from '../MyWallet/styledComponents';
import Timer from '../Timer';
import {
  NameBox,
  ParentBox,
  PriceContainer,
  PriceText,
  StyledSubTypography,
  TimerWrapper,
  UsdText
} from './styledComponents';

export const NftInfo = ({ token, expiryTimestamp }) => {
  const { name, maticPrice, usdPrice, isListed } = token;

  const { seconds, minutes, hours, days } = useTimer({
    expiryTimestamp: expiryTimestamp,
    autoStart: true
  });

  return (
    <ParentBox>
      <NameBox>
        <CardNameText>{name}</CardNameText>
      </NameBox>
      <PriceContainer>
        <Tooltip
          title={Constants.ETHEREUM}
          placement={VARIANT.TOP}
          disableInteractive
        >
          <PriceText>
            {usdPrice && isListed
              ? `$${Number(usdPrice)?.toFixed(NUMBERS.FOUR)}`
              : ' '}
            <StyledSubTypography>&nbsp;{Constants.USD}</StyledSubTypography>
          </PriceText>
        </Tooltip>
        <UsdText>
          {isListed ? `${Number(maticPrice)?.toFixed(NUMBERS.SIX)}` : ' '}
          <StyledSubTypography>
            &nbsp;{Constants.ETHEREUM_SYMBOL}
          </StyledSubTypography>
        </UsdText>
      </PriceContainer>
      <TimerWrapper>
        <Timer seconds={seconds} minutes={minutes} hours={hours} days={days} />
      </TimerWrapper>
    </ParentBox>
  );
};
