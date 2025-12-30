import React from 'react';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PopUpModal from 'modals/PopUpModal';
import { Constants } from 'utilities/constants';

interface CampaignWarningModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const CampaignWarningModal: React.FC<CampaignWarningModalProps> = ({
  open,
  onClose,
  title,
  message
}) => {
  return (
    <PopUpModal
      open={open}
      onClose={onClose}
      icon={<ErrorOutlineIcon sx={{ color: '#ff6565', fontSize: '4rem' }} />}
      title={title}
      subtitle={message}
      buttonText={Constants.OK}
      onButtonClick={onClose}
      hasRedirection={false}
      width="500px"
    />
  );
};
