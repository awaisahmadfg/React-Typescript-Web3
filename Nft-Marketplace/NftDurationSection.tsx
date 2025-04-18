import React, { Dispatch, useEffect, useState } from 'react';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { Box } from '@mui/material';
import { Constants, VARIANT } from 'utilities/constants';
import { nftDetailActions } from './nftDetailState/actions';
import { NftDetailAction, NftDetailState } from './nftDetailState/interfaces';
import { StyledDurationSectionMainBox } from './utils/styledComponents';
import {
  StyledDatePickerMainBox,
  StyledDatePickerSubBox,
  StyledDatePickerTextField,
  StyledDurationDropDownBox,
  StyledDurationFormControl,
  StyledDurationMenuItem,
  StyledDurationSelect,
  StyledDurationTypography
} from './styledComponents';
import { handleDurationSelect } from './utils';
import { useIsMediumScreen } from 'theme';

interface NftDurationSectionProps {
  localDispatch: Dispatch<NftDetailAction>;
  nftDetailState: NftDetailState;
}

export const NftDurationSection: React.FC<NftDurationSectionProps> = ({
  localDispatch,
  nftDetailState
}) => {
  const isMediumScreen = useIsMediumScreen();
  return (
    <StyledDurationSectionMainBox isMediumScreen={isMediumScreen}>
      <StyledDurationDropDownBox>
        <StyledDurationTypography>
          {Constants.DURATION}
        </StyledDurationTypography>
        <StyledDurationFormControl>
          <StyledDurationSelect
            defaultValue={Constants.ONE_HOUR_TEXT}
            onOpen={() =>
              localDispatch(nftDetailActions.setState({ dropDownOpen: true }))
            }
            onClose={() =>
              localDispatch(nftDetailActions.setState({ dropDownOpen: false }))
            }
            IconComponent={
              nftDetailState.dropDownOpen
                ? KeyboardArrowUpIcon
                : KeyboardArrowDownIcon
            }
            MenuProps={{
              anchorOrigin: {
                vertical: 'bottom',
                horizontal: 'center'
              },
              PaperProps: {
                sx: {
                  padding: '0.5rem'
                }
              }
            }}
          >
            <StyledDurationMenuItem
              value={Constants.CUSTOM}
              onClick={() =>
                localDispatch(
                  nftDetailActions.setState({ datePickerOpen: true })
                )
              }
            >
              {Constants.CUSTOM}
            </StyledDurationMenuItem>
            {OneHourItem(localDispatch)}
            {SixHoursItem(localDispatch)}
            {OneDayItem(localDispatch)}
            {ThreeDaysItem(localDispatch)}
            {SevenDaysItem(localDispatch)}
            {OneMonthItem(localDispatch)}
            {ThreeMonthsItem(localDispatch)}
            {SixMonthsItem(localDispatch)}
          </StyledDurationSelect>
        </StyledDurationFormControl>
      </StyledDurationDropDownBox>

      {nftDetailState.datePickerOpen && (
        <DatePickerSection
          localDispatch={localDispatch}
          nftDetailState={nftDetailState}
        />
      )}
    </StyledDurationSectionMainBox>
  );
};

const OneHourItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.ONE_HOUR_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.ONE_HOUR_TEXT, localDispatch)
      }
    >
      {Constants.ONE_HOUR_TEXT}
    </StyledDurationMenuItem>
  );
};

const SixHoursItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.SIX_HOURS_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.SIX_HOURS_TEXT, localDispatch)
      }
    >
      {Constants.SIX_HOURS_TEXT}
    </StyledDurationMenuItem>
  );
};

const OneDayItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.ONE_DAY_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.ONE_DAY_TEXT, localDispatch)
      }
    >
      {Constants.ONE_DAY_TEXT}
    </StyledDurationMenuItem>
  );
};

const ThreeDaysItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.THREE_DAYS_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.THREE_DAYS_TEXT, localDispatch)
      }
    >
      {Constants.THREE_DAYS_TEXT}
    </StyledDurationMenuItem>
  );
};

const SevenDaysItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.SEVEN_DAYS_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.SEVEN_DAYS_TEXT, localDispatch)
      }
    >
      {Constants.SEVEN_DAYS_TEXT}
    </StyledDurationMenuItem>
  );
};

const OneMonthItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.ONE_MONTH_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.ONE_MONTH_TEXT, localDispatch)
      }
    >
      {Constants.ONE_MONTH_TEXT}
    </StyledDurationMenuItem>
  );
};

const ThreeMonthsItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.THREE_MONTHS_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.THREE_MONTHS_TEXT, localDispatch)
      }
    >
      {Constants.THREE_MONTHS_TEXT}
    </StyledDurationMenuItem>
  );
};

const SixMonthsItem = (localDispatch: Dispatch<NftDetailAction>) => {
  return (
    <StyledDurationMenuItem
      value={Constants.SIX_MONTHS_TEXT}
      onClick={() =>
        handleDurationSelect(Constants.SIX_MONTHS_TEXT, localDispatch)
      }
    >
      {Constants.SIX_MONTHS_TEXT}
    </StyledDurationMenuItem>
  );
};

const DatePickerSection: React.FC<NftDurationSectionProps> = ({
  localDispatch,
  nftDetailState
}) => {
  const [startDateError, setStartDateError] = useState('');
  const [endDateError, setEndDateError] = useState('');

  const validateDates = (start: Date, end: Date) => {
    const now = Date.now(); // Current UTC timestamp
    const startTime = start.getTime();
    const endTime = end.getTime();

    const startErrors: string[] = [];
    const endErrors: string[] = [];

    if (startTime < now) {
      startErrors.push(
        'Start time must be greater than equal to the current time.'
      );
    }
    if (startTime >= endTime) {
      startErrors.push('Start time must be before the end time.');
    }

    if (endTime <= now) {
      endErrors.push('End time must be greater then the current time.');
    }
    if (endTime <= startTime) {
      endErrors.push('End time must be after the start time.');
    }

    setStartDateError(startErrors.join(' • '));
    setEndDateError(endErrors.join(' • '));
    localDispatch(
      nftDetailActions.setState({
        startDateError: startErrors.join(' • '),
        endDateError: endErrors.join(' • ')
      })
    );
  };

  const handleStartDateChange = (e) => {
    const newStartDate = new Date(e.target.value);
    localDispatch(nftDetailActions.setState({ startDate: newStartDate }));
  };

  const handleEndDateChange = (e) => {
    const newEndDate = new Date(e.target.value);
    localDispatch(nftDetailActions.setState({ endDate: newEndDate }));
  };

  useEffect(() => {
    validateDates(nftDetailState.startDate, nftDetailState.endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftDetailState.startDate, nftDetailState.endDate]);

  const formatDate = (date: Date) => {
    const pad = (num: number) => num.toString().padStart(2, '0');
    const localDate = new Date(date);
    return `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}T${pad(localDate.getHours())}:${pad(localDate.getMinutes())}`;
  };

  return (
    <StyledDatePickerMainBox>
      <StyledDatePickerSubBox>
        <StyledDatePickerTextField
          value={formatDate(nftDetailState.startDate)}
          onChange={handleStartDateChange}
          type={VARIANT.DATE_TIME_LOCAL}
          variant={VARIANT.OUTLINED}
          fullWidth
          error={!!startDateError}
          helperText={startDateError}
          InputLabelProps={{
            shrink: true
          }}
        />
      </StyledDatePickerSubBox>
      <Box>-</Box>
      <StyledDatePickerSubBox>
        <StyledDatePickerTextField
          value={formatDate(nftDetailState.endDate)}
          onChange={handleEndDateChange}
          type={VARIANT.DATE_TIME_LOCAL}
          variant={VARIANT.OUTLINED}
          fullWidth
          error={!!endDateError}
          helperText={endDateError}
          InputLabelProps={{
            shrink: true
          }}
        />
      </StyledDatePickerSubBox>
    </StyledDatePickerMainBox>
  );
};
