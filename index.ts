// Tem de ser o primeiro import: instala as novas tentativas de rede na web.
import './src/utils/webFetchRetry';
import './src/utils/secureStorePolyfill';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
