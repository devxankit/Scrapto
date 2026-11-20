/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import { registerBackgroundPushHandler } from './src/api/push';

registerBackgroundPushHandler();
AppRegistry.registerComponent(appName, () => App);
