import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { t } from '../../src/constants/i18n';
import { useAuth } from '../../src/contexts/AuthContext';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';

function ProfileMenuItem({ icon, label, value, onPress, danger }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuLeft}>
        <Ionicons
          name={icon}
          size={22}
          color={danger ? Colors.error : Colors.primary}
        />
        <Text style={[styles.menuLabel, danger && { color: Colors.error }]}>
          {label}
        </Text>
      </View>
      <View style={styles.menuRight}>
        {value && <Text style={styles.menuValue}>{value}</Text>}
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      setShowLogoutModal(true);
    } else {
      Alert.alert(
        'Излизане',
        'Сигурен ли си, че искаш да излезеш?',
        [
          { text: 'Отказ', style: 'cancel' },
          { text: 'Излез', style: 'destructive', onPress: signOut },
        ]
      );
    }
  };

  const displayName = profile?.name || 'Потребител';
  const displayEmail = profile?.email || '';
  const displayRole = profile?.role === 'trainer' ? 'Треньор' : 'Клиент';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ResponsiveContainer maxWidth={600}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{displayEmail}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{displayRole}</Text>
            </View>
          </View>
        </View>

        <View style={styles.subscriptionCard}>
          <View style={styles.subHeader}>
            <Ionicons name="diamond" size={24} color={Colors.accent} />
            <View>
              <Text style={styles.subTitle}>{t('profile.free')}</Text>
              <Text style={styles.subDesc}>Преминете към Премиум за повече функции</Text>
            </View>
          </View>
          <Pressable style={styles.upgradeButton}>
            <Text style={styles.upgradeText}>Преминете към Премиум</Text>
          </Pressable>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Акаунт</Text>
          <View style={styles.menuCard}>
            <ProfileMenuItem
              icon="person-outline"
              label={t('profile.editProfile')}
            />
            <View style={styles.menuDivider} />
            <ProfileMenuItem
              icon="barbell-outline"
              label="Фитнес цели"
              value={profile?.goal ? profile.goal.replace('_', ' ') : 'Не е избрана'}
            />
            <View style={styles.menuDivider} />
            <ProfileMenuItem
              icon="scale-outline"
              label="Тегло и метрики"
              value={profile?.weight ? `${profile.weight} кг` : '--'}
            />
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>{t('profile.settings')}</Text>
          <View style={styles.menuCard}>
            <ProfileMenuItem
              icon="language-outline"
              label={t('profile.language')}
              value={profile?.language === 'bg' ? 'Български' : 'English'}
            />
            <View style={styles.menuDivider} />
            <ProfileMenuItem
              icon="notifications-outline"
              label="Известия"
            />
            <View style={styles.menuDivider} />
            <ProfileMenuItem
              icon="moon-outline"
              label="Тъмна тема"
              value="Вкл."
            />
          </View>
        </View>

        <View style={styles.menuSection}>
          <View style={styles.menuCard}>
            <ProfileMenuItem
              icon="help-circle-outline"
              label="Помощ и поддръжка"
            />
            <View style={styles.menuDivider} />
            <ProfileMenuItem
              icon="document-text-outline"
              label="Условия за ползване"
            />
            <View style={styles.menuDivider} />
            <ProfileMenuItem
              icon="log-out-outline"
              label={t('profile.logout')}
              danger
              onPress={handleSignOut}
            />
          </View>
        </View>

        <Text style={styles.version}>GymApp v1.0.0</Text>
        <View style={{ height: Spacing.xl }} />
        </ResponsiveContainer>
      </ScrollView>

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLogoutModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Излизане</Text>
            <Text style={styles.modalMessage}>Сигурен ли си, че искаш да излезеш?</Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalBtnCancel}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Отказ</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtnConfirm}
                onPress={() => { setShowLogoutModal(false); signOut(); }}
              >
                <Text style={styles.modalBtnConfirmText}>Излез</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.white,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  profileEmail: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  roleText: {
    fontSize: FontSize.xs,
    color: Colors.primaryLight,
    fontWeight: '600',
  },
  subscriptionCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  subTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  subDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  upgradeText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  menuSection: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  menuSectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  menuLabel: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '500',
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  menuValue: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: 52,
  },
  version: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  modalMessage: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.error,
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
  },
});
