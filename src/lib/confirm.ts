import { Alert, Platform } from 'react-native';

export function confirmAction(
  title: string,
  message: string,
  destructiveLabel: string,
  cancelLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel' },
      { text: destructiveLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}
