/**
 * Fixed app data: category photos and families, languages, vehicles, cities.
 *
 * Category NAMES and RATES come from the admin's price list
 * (GET /api/public/prices). This file only maps a category name to its photo,
 * family and unit, the way the web app did, so a new admin category still
 * shows (with a neutral tile) without an app update.
 */
import { ImageSourcePropType } from 'react-native';
import { FamilyKey } from '../theme';

export const images = {
  logoMark: require('../assets/images/logo_mark.png'),
  /** Full Scraptox logo (mark + wordmark), the same image as the launcher icon and splash. */
  logoFull: require('../assets/images/logo_full.png'),
  heroPartner: require('../assets/images/hero_partner.jpg'),
  avatarPartner: require('../assets/images/avatar_partner.jpg'),
  avatarUser: require('../assets/images/avatar_user.jpg'),
  kycApproved: require('../assets/images/kyc_approved.jpg'),
  planSilver: require('../assets/images/plan_silver.jpg'),
  planGold: require('../assets/images/plan_gold.jpg'),
  planPlatinum: require('../assets/images/plan_platinum.jpg'),
  emptyJobs: require('../assets/images/empty_jobs.jpg'),
  emptyBids: require('../assets/images/empty_bids.jpg'),
  emptyChats: require('../assets/images/empty_chats.jpg'),
  emptyWallet: require('../assets/images/empty_wallet.jpg'),
  emptyNotifications: require('../assets/images/empty_notifications.jpg'),
  refer: require('../assets/images/refer.jpg'),
  podium: require('../assets/images/podium.jpg'),
  stepPickup: require('../assets/images/step_doorstep_pickup.jpg'),
  stepWeighing: require('../assets/images/step_digital_weighing.jpg'),
};

type CatMeta = { image: ImageSourcePropType; family: FamilyKey; unit: 'kg' | 'pc'; hint: string };

const C = (image: ImageSourcePropType, family: FamilyKey, unit: 'kg' | 'pc', hint: string): CatMeta => ({ image, family, unit, hint });

/** Keyed by the lower-cased admin category name. */
const META: Record<string, CatMeta> = {
  newspaper: C(require('../assets/images/cat_paper.jpg'), 'paper', 'kg', 'Newspapers, magazines, books'),
  paper: C(require('../assets/images/cat_paper.jpg'), 'paper', 'kg', 'Cartons, office paper, books'),
  cardboard: C(require('../assets/images/cat_paper.jpg'), 'paper', 'kg', 'Boxes and cartons'),
  copper: C(require('../assets/images/cat_copper.jpg'), 'metals', 'kg', 'Wires, pipes, utensils'),
  brass: C(require('../assets/images/cat_brass.jpg'), 'metals', 'kg', 'Taps, fittings, utensils'),
  aluminium: C(require('../assets/images/cat_aluminium.jpg'), 'metals', 'kg', 'Cans, frames, utensils'),
  iron: C(require('../assets/images/cat_iron.jpg'), 'metals', 'kg', 'Rods, sheets, almirahs'),
  steel: C(require('../assets/images/cat_steel.jpg'), 'metals', 'kg', 'Utensils, racks, sinks'),
  metal: C(require('../assets/images/cat_metal.jpg'), 'metals', 'kg', 'Mixed metal scrap'),
  'wire & cable': C(require('../assets/images/cat_wire_cable.jpg'), 'metals', 'kg', 'Electric wires and cables'),
  plastic: C(require('../assets/images/cat_plastic.jpg'), 'plastic', 'kg', 'Bottles, buckets, containers'),
  glass: C(require('../assets/images/cat_glass.jpg'), 'other', 'kg', 'Bottles and jars'),
  'e-waste': C(require('../assets/images/cat_electronics.jpg'), 'ewaste', 'kg', 'Phones, CPUs, chargers, boards'),
  electronic: C(require('../assets/images/cat_electronics.jpg'), 'ewaste', 'kg', 'Phones, CPUs, chargers, boards'),
  battery: C(require('../assets/images/cat_battery.jpg'), 'ewaste', 'kg', 'Inverter and car batteries'),
  'split ac': C(require('../assets/images/cat_appliance_ac.jpg'), 'appliances', 'pc', 'Indoor + outdoor unit'),
  refrigerator: C(require('../assets/images/cat_appliance_refrigerator.jpg'), 'appliances', 'pc', 'Single or double door'),
  'washing machine': C(require('../assets/images/cat_appliance_washing_machine.jpg'), 'appliances', 'pc', 'Top or front load'),
  cooler: C(require('../assets/images/cat_appliance_cooler.jpg'), 'appliances', 'pc', 'Desert or room cooler'),
  'ceiling fan': C(require('../assets/images/cat_appliance_fans.jpg'), 'appliances', 'pc', 'Any size'),
  geyser: C(require('../assets/images/cat_appliance_geyser.jpg'), 'appliances', 'pc', 'Storage or instant'),
  microwave: C(require('../assets/images/cat_appliance_microwave.jpg'), 'appliances', 'pc', 'Microwave and OTG'),
  'tv / monitor': C(require('../assets/images/cat_appliance_tv_monitor.jpg'), 'appliances', 'pc', 'LED, LCD, CRT'),
  tyres: C(require('../assets/images/cat_tyre_rubber.jpg'), 'vehicles', 'kg', 'Car, bike and truck tyres'),
  'old vehicle': C(require('../assets/images/cat_vehicles.jpg'), 'vehicles', 'kg', 'Scooters, bikes, cars'),
  'wooden furniture': C(require('../assets/images/cat_wooden_furniture.jpg'), 'other', 'kg', 'Beds, tables, chairs'),
};

const FALLBACK: CatMeta = C(require('../assets/images/cat_metal.jpg'), 'other', 'kg', 'Mixed scrap');

export function categoryMeta(name: string): CatMeta {
  return META[name.trim().toLowerCase()] ?? FALLBACK;
}

export type Language = { id: string; native: string; en: string; letter: string; rtl?: boolean };

/** The 13 languages the web app supports. */
export const LANGUAGES: Language[] = [
  { id: 'en', native: 'English', en: 'English', letter: 'A' },
  { id: 'hi', native: 'हिन्दी', en: 'Hindi', letter: 'अ' },
  { id: 'bn', native: 'বাংলা', en: 'Bengali', letter: 'অ' },
  { id: 'mr', native: 'मराठी', en: 'Marathi', letter: 'म' },
  { id: 'te', native: 'తెలుగు', en: 'Telugu', letter: 'తె' },
  { id: 'ta', native: 'தமிழ்', en: 'Tamil', letter: 'த' },
  { id: 'gu', native: 'ગુજરાતી', en: 'Gujarati', letter: 'ગ' },
  { id: 'ur', native: 'اردو', en: 'Urdu', letter: 'ا', rtl: true },
  { id: 'kn', native: 'ಕನ್ನಡ', en: 'Kannada', letter: 'ಕ' },
  { id: 'or', native: 'ଓଡ଼ିଆ', en: 'Odia', letter: 'ଓ' },
  { id: 'ml', native: 'മലയാളം', en: 'Malayalam', letter: 'മ' },
  { id: 'pa', native: 'ਪੰਜਾਬੀ', en: 'Punjabi', letter: 'ਪ' },
  { id: 'as', native: 'অসমীয়া', en: 'Assamese', letter: 'অ' },
];

/** Vehicle types (backend scrapper.vehicleInfo.type). */
export const VEHICLES: { id: 'bike' | 'auto' | 'truck'; name: string; hint: string; capacity: number }[] = [
  { id: 'bike', name: 'Bike / cycle', hint: 'Small household pickups', capacity: 50 },
  { id: 'auto', name: 'Auto / e-rickshaw', hint: 'Most home pickups', capacity: 300 },
  { id: 'truck', name: 'Tempo / truck', hint: 'Appliances and bulk lots', capacity: 1500 },
];

/** Services a partner can offer (backend scrapper.services). */
export const SERVICES: { id: 'scrap_pickup' | 'home_cleaning'; name: string; hint: string }[] = [
  { id: 'scrap_pickup', name: 'Scrap pickup', hint: 'Buy scrap at the customer’s door' },
  { id: 'home_cleaning', name: 'Cleaning services', hint: 'Home and office cleaning jobs' },
];

export const HOW_HEARD = ['Friend or other collector', 'YouTube', 'Instagram', 'Facebook', 'Google', 'WhatsApp', 'Other'];

export const CITIES = ['Gurugram', 'Delhi', 'Noida', 'Faridabad', 'Ghaziabad', 'Jaipur', 'Lucknow', 'Chandigarh', 'Mumbai', 'Pune', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Kolkata', 'Chennai', 'Indore'];

export const HELP_TOPICS = ['Pickup issue', 'Payment or wallet', 'Subscription', 'KYC', 'App not working', 'Other'];

/** Reasons the web app offers when a partner reports a marketplace lot. */
export const REPORT_REASONS = ['Fake or misleading lot', 'Wrong weight or photos', 'Seller not responding', 'Asked to pay outside the app', 'Other'];
