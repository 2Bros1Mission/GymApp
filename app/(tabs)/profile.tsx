import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ColorPalette, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { ResponsiveContainer } from '../../src/components/ResponsiveContainer';
import {
  getNotificationPreferences,
  toggleNotifications,
  updateReminderTime,
  addNotificationResponseListener,
} from '../../src/lib/notificationService';

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.text },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg,
    backgroundColor: colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, gap: Spacing.md, marginTop: Spacing.md,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.white },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text },
  profileEmail: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: colors.primaryDark, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm, marginTop: Spacing.sm },
  roleText: { fontSize: FontSize.xs, color: colors.primaryLight, fontWeight: '600' },
  subscriptionCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md, backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.accent + '40',
  },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  subTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.text },
  subDesc: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  upgradeButton: { backgroundColor: colors.accent, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  upgradeText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.black },
  menuSection: { marginTop: Spacing.lg, paddingHorizontal: Spacing.lg },
  menuSectionTitle: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  menuCard: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  menuLabel: { fontSize: FontSize.md, color: colors.text, fontWeight: '500' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  menuValue: { fontSize: FontSize.sm, color: colors.textSecondary },
  menuDivider: { height: 1, backgroundColor: colors.divider, marginLeft: 52 },
  version: { textAlign: 'center', fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.xl, width: '85%', maxWidth: 400 },
  modalTitle: { fontSize: FontSize.xl, fontWeight: '700', color: colors.text, marginBottom: Spacing.sm },
  modalMessage: { fontSize: FontSize.md, color: colors.textSecondary, marginBottom: Spacing.xl },
  modalButtons: { flexDirection: 'row', gap: Spacing.md },
  modalBtnCancel: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: colors.background, alignItems: 'center' },
  modalBtnCancelText: { fontSize: FontSize.md, fontWeight: '600', color: colors.text },
  modalBtnConfirm: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: colors.error, alignItems: 'center' },
  modalBtnConfirmText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
  timePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  timeOption: { width: '22%', paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: colors.background, alignItems: 'center', flexGrow: 1 },
  timeOptionActive: { backgroundColor: colors.primary },
  timeOptionText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.text },
  timeOptionTextActive: { color: colors.white },
});

function ProfileMenuItem({ icon, label, value, onPress, danger, colors }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  colors: ColorPalette;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuLeft}>
        <Ionicons
          name={icon}
          size={22}
          color={danger ? colors.error : colors.primary}
        />
        <Text style={[styles.menuLabel, danger && { color: colors.error }]}>
          {label}
        </Text>
      </View>
      <View style={styles.menuRight}>
        {value && <Text style={styles.menuValue}>{value}</Text>}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [showReminderModal, setShowReminderModal] = useState(false);

  useEffect(() => {
    getNotificationPreferences().then((prefs) => {
      setNotificationsEnabled(prefs.enabled);
      setReminderHour(prefs.reminderHour);
      setReminderMinute(prefs.reminderMinute);
    });
  }, []);

  useEffect(() => {
    const cleanup = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'workout-reminder') {
        console.log('Workout reminder tapped');
      }
    });
    return cleanup;
  }, []);

  const handleToggleNotifications = useCallback(async () => {
    const newEnabled = !notificationsEnabled;
    const result = await toggleNotifications(
      newEnabled,
      t('notifications.reminderTitle'),
      t('notifications.reminderBody')
    );

    setNotificationsEnabled(result.enabled);

    if (result.permissionDenied) {
      if (Platform.OS !== 'web') {
        Alert.alert(t('profile.notifications'), t('profile.permissionDenied'));
      }
    }
  }, [notificationsEnabled, t]);

  const handleSetReminderTime = useCallback(async (hour: number, minute: number) => {
    setReminderHour(hour);
    setReminderMinute(minute);
    setShowReminderModal(false);
    await updateReminderTime(
      hour,
      minute,
      t('notifications.reminderTitle'),
      t('notifications.reminderBody')
    );
  }, [t]);

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      setShowLogoutModal(true);
    } else {
      Alert.alert(
        t('profile.logoutTitle'),
        t('profile.logoutConfirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.logout'), style: 'destructive', onPress: signOut },
        ]
      );
    }
  };

  const displayName = profile?.name || t('profile.defaultName');
  const displayEmail = profile?.email || '';
  const displayRole = profile?.role === 'trainer' ? t('role.trainer') : t('role.client');

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
              <Ionicons name="diamond" size={24} color={colors.accent} />
              <View>
                <Text style={styles.subTitle}>{t('profile.free')}</Text>
                <Text style={styles.subDesc}>{t('profile.upgradeDesc')}</Text>
              </View>
            </View>
            <Pressable style={styles.upgradeButton}>
              <Text style={styles.upgradeText}>{t('profile.upgrade')}</Text>
            </Pressable>
          </View>

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{t('profile.account')}</Text>
            <View style={styles.menuCard}>
              <ProfileMenuItem
                icon="person-outline"
                label={t('profile.editProfile')}
                onPress={() => router.push('/edit-profile')}
                colors={colors}
              />
              <View style={styles.menuDivider} />
              <ProfileMenuItem
                icon="barbell-outline"
                label={t('profile.fitnessGoals')}
                value={profile?.goal ? profile.goal.replace('_', ' ') : t('profile.noGoal')}
                colors={colors}
              />
              <View style={styles.menuDivider} />
              <ProfileMenuItem
                icon="scale-outline"
                label={t('profile.weightMetrics')}
                value={profile?.weight ? `${profile.weight} ${t('exercise.weight')}` : '--'}
                colors={colors}
              />
            </View>
          </View>

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{t('profile.settings')}</Text>
            <View style={styles.menuCard}>
              <ProfileMenuItem
                icon="language-outline"
                label={t('profile.language')}
                value={language === 'bg' ? 'Български' : 'English'}
                onPress={() => setLanguage(language === 'bg' ? 'en' : 'bg')}
                colors={colors}
              />
              <View style={styles.menuDivider} />
              <ProfileMenuItem
                icon="notifications-outline"
                label={t('profile.notifications')}
                value={notificationsEnabled ? t('profile.notificationsOn') : t('profile.notificationsOff')}
                onPress={handleToggleNotifications}
                colors={colors}
              />
              {notificationsEnabled && (
                <>
                  <View style={styles.menuDivider} />
                  <ProfileMenuItem
                    icon="time-outline"
                    label={t('profile.reminderTime')}
                    value={`${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`}
                    onPress={() => setShowReminderModal(true)}
                    colors={colors}
                  />
                </>
              )}
              <View style={styles.menuDivider} />
              <ProfileMenuItem
                icon="moon-outline"
                label={t('profile.darkTheme')}
                value={isDark ? t('common.on') : t('common.off')}
                onPress={toggleTheme}
                colors={colors}
              />
            </View>
          </View>

          <View style={styles.menuSection}>
            <View style={styles.menuCard}>
              <ProfileMenuItem
                icon="help-circle-outline"
                label={t('profile.help')}
                onPress={() => router.push('/help')}
                colors={colors}
              />
              <View style={styles.menuDivider} />
              <ProfileMenuItem
                icon="document-text-outline"
                label={t('profile.terms')}
                onPress={() => router.push('/terms')}
                colors={colors}
              />
              <View style={styles.menuDivider} />
              <ProfileMenuItem
                icon="log-out-outline"
                label={t('profile.logout')}
                danger
                onPress={handleSignOut}
                colors={colors}
              />
            </View>
          </View>

          <Text style={styles.version}>GymApp v1.0.0</Text>
          <View style={{ height: Spacing.xl }} />
        </ResponsiveContainer>
      </ScrollView>

      <Modal
        visible={showReminderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReminderModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowReminderModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('profile.reminderTime')}</Text>
            <View style={styles.timePickerGrid}>
              {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((hour) => (
                <Pressable
                  key={hour}
                  style={[
                    styles.timeOption,
                    hour === reminderHour && styles.timeOptionActive,
                  ]}
                  onPress={() => handleSetReminderTime(hour, 0)}
                >
                  <Text
                    style={[
                      styles.timeOptionText,
                      hour === reminderHour && styles.timeOptionTextActive,
                    ]}
                  >
                    {`${String(hour).padStart(2, '0')}:00`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.modalBtnCancel}
              onPress={() => setShowReminderModal(false)}
            >
              <Text style={styles.modalBtnCancelText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLogoutModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('profile.logoutTitle')}</Text>
            <Text style={styles.modalMessage}>{t('profile.logoutConfirm')}</Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalBtnCancel}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtnConfirm}
                onPress={() => { setShowLogoutModal(false); signOut(); }}
              >
                <Text style={styles.modalBtnConfirmText}>{t('profile.logout')}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
