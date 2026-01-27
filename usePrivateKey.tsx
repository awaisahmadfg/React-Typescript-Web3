import { useCallback, useEffect, useState } from 'react';
import { Tag } from 'components/CardTag';
import dataProvider from 'dataPrvider';
import { NUMBERS } from 'utilities/constants';

interface UsePrivateKeyProps {
  activeProfile: {
    id?: string;
    walletAddress?: string;
    privateKey?: string;
  };
}

export const usePrivateKey = ({ activeProfile }: UsePrivateKeyProps) => {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [privateKeyTooltip, setPrivateKeyTooltip] =
    useState<string>('View private key');
  const [loadingPrivateKey, setLoadingPrivateKey] = useState(false);

  useEffect(() => {
    setPrivateKey(null);
    setShowPrivateKey(false);
    setPrivateKeyTooltip('View private key');
  }, [activeProfile?.walletAddress]);

  const getPrivateKeyFromTag = useCallback(
    async (profileId: string): Promise<string | null> => {
      try {
        const tag = await dataProvider.getList<Tag>('tags', {
          filter: { owner: profileId },
          pagination: undefined,
          sort: undefined
        });

        if (!tag?.data?.length) {
          return null;
        }

        const tagWithPrivateKey = tag.data.find((t) => !!t.privateKey);

        if (!tagWithPrivateKey) {
          return null;
        }

        return tagWithPrivateKey.privateKey;
      } catch (error) {
        console.error('Error getting tag private key', error);
        return null;
      }
    },
    []
  );

  const getPrivateKeyFromProfile = useCallback(
    (profilePrivateKey: string): string | null => {
      if (!profilePrivateKey) {
        return null;
      }

      return profilePrivateKey;
    },
    []
  );

  const fetchPrivateKey = useCallback(async () => {
    if (privateKey) return;

    const displayedWalletAddress = activeProfile?.walletAddress;
    if (!displayedWalletAddress) {
      setPrivateKey(null);
      return;
    }

    setLoadingPrivateKey(true);
    try {
      let fetchedPrivateKey: string | null = null;

      if (activeProfile?.privateKey) {
        fetchedPrivateKey = getPrivateKeyFromProfile(activeProfile.privateKey);
      }

      if (!fetchedPrivateKey && activeProfile?.id) {
        fetchedPrivateKey = await getPrivateKeyFromTag(activeProfile.id);
      }

      setPrivateKey(fetchedPrivateKey);
    } catch (error) {
      console.error('Error fetching private key:', error);
      setPrivateKey(null);
    } finally {
      setLoadingPrivateKey(false);
    }
  }, [
    activeProfile,
    privateKey,
    getPrivateKeyFromTag,
    getPrivateKeyFromProfile
  ]);

  const handleTogglePrivateKey = useCallback(() => {
    if (!showPrivateKey && !privateKey) {
      fetchPrivateKey();
    }
    setShowPrivateKey((prev) => !prev);
  }, [showPrivateKey, privateKey, fetchPrivateKey]);

  const handleCopyPrivateKey = useCallback(() => {
    if (!privateKey) return;

    navigator.clipboard.writeText(privateKey);
    setPrivateKeyTooltip('Private key copied!');

    setTimeout(() => {
      setPrivateKeyTooltip('View private key');
    }, NUMBERS.TWO_THOUSAND);
  }, [privateKey]);

  return {
    showPrivateKey,
    privateKey,
    loadingPrivateKey,
    privateKeyTooltip,
    handleTogglePrivateKey,
    handleCopyPrivateKey
  };
};

