import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Gift, House, Plus, User } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { colors } from '../theme';
import { useStore } from '../store/AppStore';
import { SplashScreen, LanguageScreen, LoginScreen, OtpScreen } from '../screens/auth';
import { HomeScreen, CategoriesScreen, PricesScreen, NotificationsScreen } from '../screens/home';
import { SellCategoryScreen, SellPhotosScreen, SellWeightScreen, SellAddressScreen, SellConfirmScreen, SellSuccessScreen } from '../screens/sell';
import { RequestsScreen, OrderScreen, ReviewScreen, MyReviewsScreen } from '../screens/orders';
import { ChatsScreen, ChatThreadScreen } from '../screens/chat';
import { WalletScreen, WithdrawScreen, CouponsScreen } from '../screens/wallet';
import { ProfileScreen, EditProfileScreen, AddressesScreen, AddressFormScreen, ReferScreen, LeaderboardScreen, HelpScreen, LegalScreen, SettingsLanguageScreen } from '../screens/profile';
import { CleaningScreen, CleaningBookScreen } from '../screens/cleaning';

export type TabParams = { Home: undefined; Requests: undefined; Sell: undefined; Refer: undefined; Profile: undefined };

export type RootParams = {
  Splash: undefined;
  Language: undefined;
  Login: undefined;
  Otp: { phone: string; isNewUser: boolean };
  Main: NavigatorScreenParams<TabParams> | undefined;
  Categories: undefined;
  Prices: undefined;
  Notifications: undefined;
  SellCategory: { preselect?: string } | undefined;
  SellPhotos: undefined;
  SellWeight: undefined;
  SellAddress: undefined;
  SellConfirm: undefined;
  SellSuccess: { orderId: string; orderNo: string; later: boolean; cleaning?: boolean };
  Order: { id: string };
  Review: { orderId: string };
  MyReviews: undefined;
  Chats: undefined;
  ChatThread: { orderId?: string; chatId?: string; name?: string };
  Wallet: undefined;
  Withdraw: undefined;
  Coupons: undefined;
  EditProfile: undefined;
  Addresses: { pick?: boolean } | undefined;
  AddressForm: { id?: string; pick?: boolean } | undefined;
  Leaderboard: undefined;
  Help: undefined;
  Legal: { kind: 'terms' | 'privacy' };
  SettingsLanguage: undefined;
  Cleaning: undefined;
  CleaningBook: { serviceId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootParams {}
  }
}

const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();

/** Flat tab bar: hairline top border, 3px active marker, solid green "Sell" key in the middle. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const items: { name: keyof TabParams; label: string; Icon: typeof House }[] = [
    { name: 'Home', label: t('tabs.home'), Icon: House },
    { name: 'Requests', label: t('tabs.requests'), Icon: ClipboardList },
    { name: 'Sell', label: t('tabs.sell'), Icon: Plus },
    { name: 'Refer', label: t('tabs.refer'), Icon: Gift },
    { name: 'Profile', label: t('tabs.profile'), Icon: User },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) + 4 }}>
      {items.map((it) => {
        const index = state.routes.findIndex((r) => r.name === it.name);
        const active = state.index === index;
        const sell = it.name === 'Sell';
        return (
          <Pressable
            key={it.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={it.label}
            onPress={() => {
              if (sell) {
                navigation.getParent()?.navigate('SellCategory');
                return;
              }
              const e = navigation.emit({ type: 'tabPress', target: state.routes[index].key, canPreventDefault: true });
              if (!active && !e.defaultPrevented) navigation.navigate(it.name);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: 44, justifyContent: 'center' }}>
            {active ? <View style={{ position: 'absolute', top: -9, width: 28, height: 3, borderRadius: 2, backgroundColor: colors.brand }} /> : null}
            {sell ? (
              <View style={{ width: 38, height: 26, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={18} color={colors.white} strokeWidth={3} />
              </View>
            ) : (
              <it.Icon size={22} color={active ? colors.primary : colors.muted} fill={active ? '#E3F4E8' : 'none'} strokeWidth={2} />
            )}
            <T size={11} w={active || sell ? 'bold' : 'semibold'} color={active ? colors.primary : sell ? colors.ink : colors.muted}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const Empty = () => null;
const renderTabBar = (p: BottomTabBarProps) => <TabBar {...p} />;

function Main() {
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Requests" component={RequestsScreen} />
      <Tab.Screen name="Sell" component={Empty} />
      <Tab.Screen name="Refer" component={ReferScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary } };

export default function RootNavigator() {
  const { ready, user, lang } = useStore();
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!ready ? (
          <Stack.Screen name="Splash" component={SplashScreen} />
        ) : !user ? (
          <>
            {!lang ? <Stack.Screen name="Language" component={LanguageScreen} /> : null}
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={Main} />
            <Stack.Screen name="Categories" component={CategoriesScreen} />
            <Stack.Screen name="Prices" component={PricesScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="SellCategory" component={SellCategoryScreen} />
            <Stack.Screen name="SellPhotos" component={SellPhotosScreen} />
            <Stack.Screen name="SellWeight" component={SellWeightScreen} />
            <Stack.Screen name="SellAddress" component={SellAddressScreen} />
            <Stack.Screen name="SellConfirm" component={SellConfirmScreen} />
            <Stack.Screen name="SellSuccess" component={SellSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="Order" component={OrderScreen} />
            <Stack.Screen name="Review" component={ReviewScreen} />
            <Stack.Screen name="MyReviews" component={MyReviewsScreen} />
            <Stack.Screen name="Chats" component={ChatsScreen} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
            <Stack.Screen name="Withdraw" component={WithdrawScreen} />
            <Stack.Screen name="Coupons" component={CouponsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Addresses" component={AddressesScreen} />
            <Stack.Screen name="AddressForm" component={AddressFormScreen} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            <Stack.Screen name="Help" component={HelpScreen} />
            <Stack.Screen name="Legal" component={LegalScreen} />
            <Stack.Screen name="SettingsLanguage" component={SettingsLanguageScreen} />
            <Stack.Screen name="Cleaning" component={CleaningScreen} />
            <Stack.Screen name="CleaningBook" component={CleaningBookScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
