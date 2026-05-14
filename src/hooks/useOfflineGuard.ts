import { Alert, Platform } from 'react-native';
import { useNetwork } from '../contexts/NetworkContext';
import { useTranslation } from '../contexts/LanguageContext';

export function useOfflineGuard() {
  const { isConnected } = useNetwork();
  const { t } = useTranslation();

  const guardAction = (action: () => void | Promise<void>) => {
    if (!isConnected) {
      if (Platform.OS === 'web') {
        window.alert(t('network.actionRequiresNetwork'));
      } else {
        Alert.alert(t('network.offline'), t('network.actionRequiresNetwork'));
      }
      return;
    }
    action();
  };

  return { isConnected, guardAction };
}
