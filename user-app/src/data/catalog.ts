/**
 * Fixed app data: category photos and families, languages, pickup slots.
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
  heroUser: require('../assets/images/hero_user.jpg'),
  avatarUser: require('../assets/images/avatar_user.jpg'),
  avatarPartner: require('../assets/images/avatar_partner.jpg'),
  bannerPickup: require('../assets/images/banner_doorstep_free_pickup.jpg'),
  bannerRates: require('../assets/images/banner_best_market_rates.jpg'),
  bannerUpi: require('../assets/images/banner_instant_upi_payment.jpg'),
  bannerCollectors: require('../assets/images/banner_verified_collectors.jpg'),
  bannerGreen: require('../assets/images/banner_clean_green_india.jpg'),
  bannerRecycle: require('../assets/images/banner_reduce_reuse_recycle.jpg'),
  stepCategory: require('../assets/images/step_select_category.jpg'),
  stepPhotos: require('../assets/images/step_upload_photos.jpg'),
  stepSchedule: require('../assets/images/step_schedule_date.jpg'),
  stepPickup: require('../assets/images/step_doorstep_pickup.jpg'),
  stepWeighing: require('../assets/images/step_digital_weighing.jpg'),
  stepPayout: require('../assets/images/step_instant_payout.jpg'),
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

/** Pickup slots offered on the confirm step (the web app's time slots). */
export const SLOT_TIMES = ['9 AM – 11 AM', '11 AM – 1 PM', '1 PM – 3 PM', '3 PM – 5 PM', '5 PM – 7 PM'];

export type CleaningIcon = 'house' | 'car' | 'droplets' | 'sofa' | 'sun' | 'building' | 'warehouse' | 'truck';

export type CleaningService = {
  /** Same ids as backend CLEANING_SERVICE_TYPES. */
  id: string;
  name: string;
  hint: string;
  icon: CleaningIcon;
  /** Tile colours: a light tint and a deep accent (light + dark pairing). */
  tint: string;
  accent: string;
  /** What the size chips ask about, and the choices. */
  sizeLabel: string;
  sizes: string[];
};

/**
 * Cleaning services. Priced by the partner after an inspection visit; the user
 * then pays online in the app (Razorpay via the wallet). Carpet cleaning is
 * offered with super dry cleaning, shown as "Super Dry / Carpet Cleaning".
 */
export const CLEANING_SERVICES: CleaningService[] = [
  { id: 'home_cleaning', name: 'Home Cleaning', hint: 'Kitchen, bathrooms, floors and windows', icon: 'house', tint: '#E3F4E8', accent: '#00542A', sizeLabel: 'Size of the home', sizes: ['1 BHK', '2 BHK', '3 BHK', '4 BHK+', 'Villa / bungalow'] },
  { id: 'car_cleaning', name: 'Car Cleaning', hint: 'Interior vacuum, foam wash and polish', icon: 'car', tint: '#E7EFFC', accent: '#1D4F9C', sizeLabel: 'Type of car', sizes: ['Hatchback', 'Sedan', 'SUV / MUV', '2 or more cars'] },
  { id: 'water_tank_cleaning', name: 'Water Tank Cleaning', hint: 'Drain, scrub, disinfect and rinse', icon: 'droplets', tint: '#DFF3F4', accent: '#0B5A62', sizeLabel: 'Tank capacity', sizes: ['Up to 500 L', '500 – 1000 L', '1000 – 2000 L', 'Above 2000 L', 'Underground sump'] },
  { id: 'super_dry_carpet_cleaning', name: 'Super Dry / Carpet Cleaning', hint: 'Sofas, carpets, mattresses and curtains', icon: 'sofa', tint: '#EEEAFE', accent: '#4A33A8', sizeLabel: 'What needs cleaning', sizes: ['Sofa set', 'Carpet / rug', 'Mattress', 'Curtains', 'Multiple items'] },
  { id: 'solar_panel_cleaning', name: 'Solar Panel Cleaning', hint: 'Dust and bird-dropping removal for more output', icon: 'sun', tint: '#FFF3DC', accent: '#7A4F00', sizeLabel: 'Number of panels', sizes: ['Up to 5', '6 – 10', '11 – 20', 'More than 20'] },
  { id: 'office_cleaning', name: 'Office Cleaning', hint: 'Desks, cabins, washrooms, pantry', icon: 'building', tint: '#ECEFF2', accent: '#38444E', sizeLabel: 'Size of the office', sizes: ['Up to 500 sq ft', '500 – 1500 sq ft', '1500 – 3000 sq ft', 'Above 3000 sq ft'] },
  { id: 'garage_cleaning', name: 'Garage & Store-room Clearing', hint: 'We sort, clear and buy the scrap', icon: 'warehouse', tint: '#F7ECE2', accent: '#7A3F12', sizeLabel: 'Size of the space', sizes: ['Small room', 'Garage', 'Large store-room'] },
  { id: 'debris_removal', name: 'Debris Removal', hint: 'Construction and renovation waste', icon: 'truck', tint: '#F2EEE4', accent: '#5C4A24', sizeLabel: 'Amount of debris', sizes: ['A few bags', 'Half a truck', 'Full truck'] },
];

/** 1% platform fee on a cleaning job, minimum ₹1 (backend cleaningPlatformFee). */
export const cleaningFee = (amount: number) => (amount > 0 ? Math.max(1, Math.round(amount * 0.01 * 100) / 100) : 0);

export const HOW_HEARD = ['Friends or family', 'YouTube', 'Instagram', 'Facebook', 'Google', 'WhatsApp', 'Other'];

export const HELP_TOPICS = ['Pickup issue', 'Payment issue', 'Collector behaviour', 'App not working', 'Other'];
