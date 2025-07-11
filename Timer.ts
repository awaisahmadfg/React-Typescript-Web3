import React from 'react';
import { Digit } from './Digit';
import {
  Separtor,
  SepartorContainer,
  TimerContainer
} from './styledComponents';
import { Constants } from 'utilities/constants';

export default function Timer({ seconds, minutes, hours, days }) {
  return (
    <TimerContainer>
      {days !== undefined ? (
        <Digit value={days} title={Constants.C_DAYS} />
      ) : null}
      {days !== undefined ? (
        <SepartorContainer>
          <Separtor />
          <Separtor />
        </SepartorContainer>
      ) : null}
      <Digit value={hours} title={Constants.C_HOURS} />
      <SepartorContainer>
        <Separtor />
        <Separtor />
      </SepartorContainer>
      <Digit value={minutes} title={Constants.C_MINUTES} />
      <SepartorContainer>
        <Separtor />
        <Separtor />
      </SepartorContainer>
      <Digit value={seconds} title={Constants.C_SECONDS} />
    </TimerContainer>
  );
}
