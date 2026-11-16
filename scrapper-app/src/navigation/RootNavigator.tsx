import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Gavel, House, Package, User, Wallet } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { colors } from '../theme';
import { useStore } from '../store/AppStore';
import { useQuery } from '../hooks/useQuery';
import { SplashScreen, LanguageScreen, LoginScreen, OtpScreen, SignupScreen } from '../screens/auth';
import { KycScreen, KycStatusScreen, PlansScreen } from '../screens/onboarding';
import { DashboardScreen, RequestsScreen, NotificationsScreen, PricesScreen } from '../screens/home';
import { JobsScreen, JobScreen } from '../screens/jobs';
import { MarketScreen, LotScreen } from '../screens/market';
import { ChatsScreen, ChatThreadScreen } from '../screens/chat';
import { WalletScreen, WithdrawScreen, EarningsScreen } from '../screens/wallet';
import { ProfileScreen, EditProfileScreen, ReferScreen, LeaderboardScreen, HelpScreen, LegalScreen, SettingsLanguageScreen } from '../screens/profile';

export type TabParams = { Home: undefined; Market: undefined; Jobs: undefined; Wallet: undefined; Profile: undefined };

export type RootParams = {
  Splash: undefined;
  Language: undefined;
  Login: undefined;
  Otp: { phone: string; isNewUser: boolean };
  Signup: { phone: string; otp: string };
  Kyc: undefined;
  KycStatus: undefined;
  Plans: undefined;
  Main: NavigatorScreenParams<TabParams> | undefined;
  Requests: undefined;
  Job: { id: string };
  Lot: { id: string };
  Notifications: undefined;
  Prices: undefined;
  Chats: undefined;
  ChatThread: { orderId?: string; lotId?: string; chatId?: string; name?: string };
  Withdraw: undefined;
  Earnings: undefined;
  EditProfile: undefined;
  Refer: undefined;
  Leaderboard: undefined;
  Help: undefined;
  Legal: { kind: 'terms' | 'privacy' };
  SettingsLanguage: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootParams {}
  }
}

const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();

/** Flat tab bar: hairline top border, 3px deep-green active marker, live-job count on "Jobs". */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const jobs = useQuery<{ orders: any[] }>('/orders/my-assigned', { status: 'confirmed,in_progress' });
  const activeJobs = jobs.data?.orders?.length ?? 0;
  const items: { name: keyof TabParams; label: string; Icon: typeof House }[] = [
    { name: 'Home', label: t('tabs.home'), Icon: House },
    { name: 'Market', label: t('tabs.market'), Icon: Gavel },
    { name: 'Jobs', label: t('tabs.jobs'), Icon: Package },
    { name: 'Wallet', label: t('tabs.wallet'), Icon: Wallet },
    { name: 'Profile', label: t('tabs.profile'), Icon: User },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) + 4 }}>
      {items.map((it) => {
        const index = state.routes.findIndex((r) => r.name === it.name);
        const active = state.index === index;
        const count = it.name === 'Jobs' ? activeJobs : 0;
        return (
          <Pressable
            key={it.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count ? `${it.label}, ${count} active` : it.label}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: state.routes[index].key, canPreventDefault: true });
              if (!active && !e.defaultPrevented) navigation.navigate(it.name);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: 44, justifyContent: 'center' }}>
            {active ? <View style={{ position: 'absolute', top: -9, width: 28, height: 3, borderRadius: 2, backgroundColor: colors.deep }} /> : null}
            <View>
              <it.Icon size={22} color={active ? colors.deep : colors.muted} fill={active ? '#E3F4E8' : 'none'} strokeWidth={2} />
              {count ? (
                <View style={{ position: 'absolute', top: -5, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                  <T size={10} w="extrabold" color={colors.white} raw>{String(count)}</T>
                </View>
              ) : null}
            </View>
            <T size={11} w={active ? 'bold' : 'semibold'} color={active ? colors.deep : colors.muted}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const renderTabBar = (p: BottomTabBarProps) => <TabBar {...p} />;

function Main() {
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Market" component={MarketScreen} />
      <Tab.Screen name="Jobs" component={JobsScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.deep } };

export default function RootNavigator() {
  const { ready, user, lang } = useStore();
  const kyc = user?.kyc?.status ?? 'not_submitted';
  // Pickups open once KYC is verified and a plan is active (the backend checks the same).
  const onboarding = !!user && (kyc !== 'verified' || user.subscription?.status !== 'active');
  // The first screen of a group is where the app lands when the group opens.
  const onboardOrder: (keyof RootParams)[] = kyc === 'verified' ? ['Plans', 'KycStatus', 'Kyc'] : kyc === 'pending' ? ['KycStatus', 'Kyc', 'Plans'] : ['Kyc', 'KycStatus', 'Plans'];
  const onboardScreens = { Kyc: KycScreen, KycStatus: KycStatusScreen, Plans: PlansScreen } as Record<string, React.ComponentType<any>>;
  return (
    // A new key per phase (signed out / onboarding / main) remounts the container, so each phase
    // starts with a fresh history: finishing onboarding lands on the dashboard, not on a
    // leftover KYC or Plans screen (the container would otherwise keep those routes).
    <NavigationContainer key={!user ? 'auth' : onboarding ? 'onboarding' : 'main'} theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!ready ? (
          <Stack.Screen name="Splash" component={SplashScreen} />
        ) : !user ? (
          <>
            {!lang ? <Stack.Screen name="Language" component={LanguageScreen} /> : null}
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
          </>
        ) : onboarding ? (
          <>
            {onboardOrder.map((n) => <Stack.Screen key={n} name={n} component={onboardScreens[n]} />)}
            <Stack.Screen name="Help" component={HelpScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={Main} />
            <Stack.Screen name="Requests" component={RequestsScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Job" component={JobScreen} />
            <Stack.Screen name="Lot" component={LotScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Prices" component={PricesScreen} />
            <Stack.Screen name="Chats" component={ChatsScreen} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
            <Stack.Screen name="Withdraw" component={WithdrawScreen} />
            <Stack.Screen name="Earnings" component={EarningsScreen} />
            <Stack.Screen name="Plans" component={PlansScreen} />
            <Stack.Screen name="KycStatus" component={KycStatusScreen} />
            <Stack.Screen name="Kyc" component={KycScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Refer" component={ReferScreen} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            <Stack.Screen name="Help" component={HelpScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
            <Stack.Screen name="SettingsLanguage" component={SettingsLanguageScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
